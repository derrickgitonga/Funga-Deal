use std::env;

use secrecy::Secret;

#[derive(Clone)]
pub struct Config {
    pub mpesa_consumer_key: Secret<String>,
    pub mpesa_consumer_secret: Secret<String>,
    pub mpesa_shortcode: String,
    pub mpesa_passkey: Secret<String>,
    pub mpesa_env: String,
    pub mpesa_allowed_ips: String,

    pub nowpayments_api_key: Secret<String>,
    pub nowpayments_ipn_secret: Secret<String>,
    pub nowpayments_price_currency: String,

    pub intasend_webhook_secret: Option<Secret<String>>,

    pub internal_service_secret: Secret<String>,
    pub django_backend_url: String,

    pub vault_public_url: String,
    pub frontend_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            mpesa_consumer_key:    Secret::new(env::var("MPESA_CONSUMER_KEY")?),
            mpesa_consumer_secret: Secret::new(env::var("MPESA_CONSUMER_SECRET")?),
            mpesa_shortcode:       env::var("MPESA_SHORTCODE")?,
            mpesa_passkey:         Secret::new(env::var("MPESA_PASSKEY")?),
            mpesa_env:             env::var("MPESA_ENV").unwrap_or_else(|_| "sandbox".into()),
            mpesa_allowed_ips:     env::var("MPESA_ALLOWED_IPS")
                .unwrap_or_else(|_| "196.201.214.200,196.201.214.206".into()),

            nowpayments_api_key:        Secret::new(env::var("NOWPAYMENTS_API_KEY")?),
            nowpayments_ipn_secret:     Secret::new(env::var("NOWPAYMENTS_IPN_SECRET")?),
            nowpayments_price_currency: env::var("NOWPAYMENTS_PRICE_CURRENCY")
                .unwrap_or_else(|_| "usd".into()),

            intasend_webhook_secret: env::var("INTASEND_WEBHOOK_SECRET")
                .ok()
                .map(Secret::new),

            internal_service_secret: Secret::new(env::var("INTERNAL_SERVICE_SECRET")?),
            django_backend_url:      env::var("DJANGO_BACKEND_URL")
                .unwrap_or_else(|_| "http://localhost:8000".into()),

            vault_public_url: env::var("VAULT_PUBLIC_URL")?,
            frontend_url: env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "http://localhost:3000".into()),
        })
    }

    pub fn mpesa_base_url(&self) -> &'static str {
        if self.mpesa_env == "production" {
            "https://api.safaricom.co.ke"
        } else {
            "https://sandbox.safaricom.co.ke"
        }
    }
}
