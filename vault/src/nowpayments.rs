use hmac::{Hmac, Mac};
use reqwest::Client;
use secrecy::{ExposeSecret, Secret};
use serde::{Deserialize, Serialize};
use sha2::Sha512;

type HmacSha512 = Hmac<Sha512>;

const API_BASE: &str = "https://api.nowpayments.io/v1";

pub struct NowPaymentsClient {
    http: Client,
    api_key: Secret<String>,
    ipn_secret: Secret<String>,
}

#[derive(Serialize)]
struct CreateInvoiceRequest<'a> {
    price_amount: f64,
    price_currency: &'a str,
    order_id: &'a str,
    order_description: &'a str,
    ipn_callback_url: String,
    success_url: String,
    cancel_url: String,
}

#[derive(Deserialize, Debug)]
pub struct Invoice {
    pub id: String,
    pub invoice_url: String,
}

impl NowPaymentsClient {
    pub fn new(api_key: Secret<String>, ipn_secret: Secret<String>) -> Self {
        Self {
            http: Client::new(),
            api_key,
            ipn_secret,
        }
    }

    pub async fn create_invoice(
        &self,
        order_id: &str,
        order_description: &str,
        price_amount: f64,
        price_currency: &str,
        ipn_callback_url: String,
        success_url: String,
        cancel_url: String,
    ) -> anyhow::Result<Invoice> {
        let body = CreateInvoiceRequest {
            price_amount,
            price_currency,
            order_id,
            order_description,
            ipn_callback_url,
            success_url,
            cancel_url,
        };

        let invoice: Invoice = self
            .http
            .post(format!("{API_BASE}/invoice"))
            .header("x-api-key", self.api_key.expose_secret())
            .json(&body)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        Ok(invoice)
    }

    pub fn verify_ipn_signature(&self, sorted_json: &str, signature: &str) -> bool {
        let mut mac = HmacSha512::new_from_slice(self.ipn_secret.expose_secret().as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(sorted_json.as_bytes());
        let result = mac.finalize().into_bytes();
        let expected = hex::encode(result);
        expected.eq_ignore_ascii_case(signature)
    }
}
