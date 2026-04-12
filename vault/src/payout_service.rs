use std::sync::Arc;

use rust_decimal::Decimal;
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use tracing::error;
use uuid::Uuid;

use crate::{config::Config, mpesa::MpesaClient};

pub struct B2CClient {
    mpesa: Arc<MpesaClient>,
    config: Config,
}

#[derive(Debug)]
pub struct PayoutParams<'a> {
    pub payout_id: Uuid,
    pub escrow_id: Uuid,
    pub phone: &'a str,
    pub amount: Decimal,
    pub remarks: &'a str,
}

#[derive(Debug)]
pub struct B2CResponse {
    pub conversation_id: String,
    pub originator_conversation_id: String,
}

#[derive(Serialize)]
struct B2CRequest<'a> {
    #[serde(rename = "InitiatorName")]
    initiator_name: &'a str,
    #[serde(rename = "SecurityCredential")]
    security_credential: &'a str,
    #[serde(rename = "CommandID")]
    command_id: &'static str,
    #[serde(rename = "Amount")]
    amount: u64,
    #[serde(rename = "PartyA")]
    party_a: &'a str,
    #[serde(rename = "PartyB")]
    party_b: String,
    #[serde(rename = "Remarks")]
    remarks: &'a str,
    #[serde(rename = "QueueTimeOutURL")]
    queue_timeout_url: &'a str,
    #[serde(rename = "ResultURL")]
    result_url: &'a str,
    #[serde(rename = "Occasion")]
    occasion: &'a str,
    #[serde(rename = "OriginatorConversationID")]
    originator_conversation_id: String,
}

#[derive(Deserialize)]
struct B2CApiResponse {
    #[serde(rename = "ConversationID")]
    conversation_id: Option<String>,
    #[serde(rename = "OriginatorConversationID")]
    originator_conversation_id: Option<String>,
    #[serde(rename = "ResponseCode")]
    response_code: String,
    #[serde(rename = "ResponseDescription")]
    response_description: String,
}

impl B2CClient {
    pub fn new(mpesa: Arc<MpesaClient>, config: Config) -> Self {
        Self { mpesa, config }
    }

    pub async fn initiate_payout(&self, params: &PayoutParams<'_>) -> anyhow::Result<B2CResponse> {
        let token = self.mpesa.access_token().await?;

        let normalized_phone = normalize_phone(params.phone);
        let amount_u64 = params
            .amount
            .mantissa()
            .unsigned_abs()
            .try_into()
            .unwrap_or(0u64);

        let body = B2CRequest {
            initiator_name: &self.config.mpesa_b2c_initiator,
            security_credential: self
                .config
                .mpesa_b2c_security_credential
                .as_ref()
                .map(|s| s.expose_secret().as_str())
                .unwrap_or(""),
            command_id: "BusinessPayment",
            amount: amount_u64,
            party_a: &self.config.mpesa_shortcode,
            party_b: normalized_phone,
            remarks: params.remarks,
            queue_timeout_url: &self.config.mpesa_b2c_queue_url,
            result_url: &self.config.mpesa_b2c_result_url,
            occasion: "EscrowRelease",
            originator_conversation_id: params.payout_id.to_string(),
        };

        let resp: B2CApiResponse = reqwest::Client::new()
            .post(format!(
                "{}/mpesa/b2c/v1/paymentrequest",
                self.config.mpesa_base_url()
            ))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        if resp.response_code != "0" {
            anyhow::bail!(
                "B2C rejected: {} — {}",
                resp.response_code,
                resp.response_description
            );
        }

        Ok(B2CResponse {
            conversation_id: resp.conversation_id.unwrap_or_default(),
            originator_conversation_id: resp.originator_conversation_id.unwrap_or_default(),
        })
    }
}

pub async fn verified_payout_amount(
    db: &PgPool,
    escrow_id: Uuid,
    service_fee_bps: u32,
) -> anyhow::Result<Decimal> {
    let row = sqlx::query(
        "SELECT amount, mpesa_checkout_id FROM escrows WHERE id = $1",
    )
    .bind(escrow_id)
    .fetch_one(db)
    .await?;

    let escrow_amount: Decimal = row.try_get("amount")?;
    let checkout_id: Option<String> = row.try_get("mpesa_checkout_id").ok().flatten();

    let received_amount = match checkout_id {
        None => escrow_amount,
        Some(checkout_id) => {
            extract_received_amount(db, &checkout_id)
                .await
                .unwrap_or_else(|e| {
                    error!(
                        "Safety guard: could not parse webhook log for escrow {escrow_id}: {e}. \
                         Falling back to escrow.amount"
                    );
                    escrow_amount
                })
        }
    };

    let fee_rate = Decimal::new(service_fee_bps as i64, 4);
    let net_rate = Decimal::ONE - fee_rate;
    let payout_amount = (received_amount * net_rate).round_dp(0);

    anyhow::ensure!(
        payout_amount > Decimal::ZERO,
        "Safety guard: computed payout_amount is zero or negative for escrow {escrow_id}"
    );

    Ok(payout_amount)
}

async fn extract_received_amount(db: &PgPool, checkout_id: &str) -> anyhow::Result<Decimal> {
    let rows = sqlx::query(
        "SELECT raw_payload
         FROM webhook_audit_log
         WHERE provider = 'mpesa'
           AND signature_valid = true
           AND processed = true
         ORDER BY received_at DESC
         LIMIT 200",
    )
    .fetch_all(db)
    .await?;

    for row in rows {
        let raw: String = row.try_get("raw_payload")?;
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };

        let cb_id = v
            .pointer("/Body/stkCallback/CheckoutRequestID")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if cb_id != checkout_id {
            continue;
        }

        let result_code = v
            .pointer("/Body/stkCallback/ResultCode")
            .and_then(|v| v.as_i64())
            .unwrap_or(1);

        if result_code != 0 {
            anyhow::bail!("M-Pesa callback for {checkout_id} has ResultCode {result_code}");
        }

        let amount = v
            .pointer("/Body/stkCallback/CallbackMetadata/Item")
            .and_then(|items| items.as_array())
            .and_then(|items| {
                items.iter().find(|i| {
                    i.get("Name").and_then(|n| n.as_str()) == Some("Amount")
                })
            })
            .and_then(|i| i.get("Value"))
            .and_then(|v| v.as_f64());

        match amount {
            Some(a) => {
                return Decimal::from_f64_retain(a)
                    .ok_or_else(|| anyhow::anyhow!("Could not parse amount {a} as Decimal"));
            }
            None => anyhow::bail!("Amount not found in callback metadata for {checkout_id}"),
        }
    }

    anyhow::bail!("No matching webhook log found for checkout_id {checkout_id}")
}

fn normalize_phone(phone: &str) -> String {
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.starts_with('0') {
        format!("254{}", &digits[1..])
    } else if digits.starts_with("254") {
        digits
    } else {
        format!("254{digits}")
    }
}
