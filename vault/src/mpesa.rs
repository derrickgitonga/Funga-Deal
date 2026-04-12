use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::config::Config;

pub struct MpesaClient {
    http: Client,
    config: Config,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
struct StkPushRequest<'a> {
    business_short_code: &'a str,
    password: String,
    timestamp: String,
    transaction_type: &'static str,
    amount: u64,
    party_a: String,
    party_b: &'a str,
    phone_number: String,
    call_back_url: String,
    account_reference: &'a str,
    transaction_desc: &'a str,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "PascalCase")]
pub struct StkPushResponse {
    pub checkout_request_id: String,
    pub response_code: String,
    pub response_description: String,
    pub customer_message: String,
}

impl MpesaClient {
    pub fn new(config: Config) -> Self {
        Self {
            http: Client::new(),
            config,
        }
    }

    async fn access_token(&self) -> anyhow::Result<String> {
        let creds = STANDARD.encode(format!(
            "{}:{}",
            self.config.mpesa_consumer_key.expose_secret(),
            self.config.mpesa_consumer_secret.expose_secret(),
        ));

        let res: TokenResponse = self
            .http
            .get(format!(
                "{}/oauth/v1/generate?grant_type=client_credentials",
                self.config.mpesa_base_url()
            ))
            .header("Authorization", format!("Basic {creds}"))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        Ok(res.access_token)
    }

    pub async fn stk_push(
        &self,
        transaction_id: &str,
        phone: &str,
        amount: u64,
        description: &str,
    ) -> anyhow::Result<StkPushResponse> {
        let token = self.access_token().await?;
        let now = OffsetDateTime::now_utc();
        let timestamp = format!(
            "{:04}{:02}{:02}{:02}{:02}{:02}",
            now.year(),
            now.month() as u8,
            now.day(),
            now.hour(),
            now.minute(),
            now.second(),
        );

        let raw_password = format!(
            "{}{}{}",
            self.config.mpesa_shortcode,
            self.config.mpesa_passkey.expose_secret(),
            timestamp
        );
        let password = STANDARD.encode(raw_password);

        let normalized_phone = normalize_phone(phone);

        let body = StkPushRequest {
            business_short_code: &self.config.mpesa_shortcode,
            password,
            timestamp,
            transaction_type: "CustomerPayBillOnline",
            amount,
            party_a: normalized_phone.clone(),
            party_b: &self.config.mpesa_shortcode,
            phone_number: normalized_phone,
            call_back_url: format!("{}/payments/callback", self.config.vault_public_url),
            account_reference: transaction_id,
            transaction_desc: description,
        };

        let res: StkPushResponse = self
            .http
            .post(format!(
                "{}/mpesa/stkpush/v1/processrequest",
                self.config.mpesa_base_url()
            ))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        Ok(res)
    }
}

fn normalize_phone(phone: &str) -> String {
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.starts_with("0") {
        format!("254{}", &digits[1..])
    } else if digits.starts_with("254") {
        digits
    } else {
        format!("254{digits}")
    }
}
