use std::env;

#[derive(Clone)]
pub struct Config {
    pub mpesa_consumer_key: String,
    pub mpesa_consumer_secret: String,
    pub mpesa_shortcode: String,
    pub mpesa_passkey: String,
    pub mpesa_env: String,

    pub nowpayments_api_key: String,
    pub nowpayments_ipn_secret: String,
    pub nowpayments_price_currency: String,

    pub vault_public_url: String,
    pub frontend_url: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            mpesa_consumer_key:    env::var("MPESA_CONSUMER_KEY")?,
            mpesa_consumer_secret: env::var("MPESA_CONSUMER_SECRET")?,
            mpesa_shortcode:       env::var("MPESA_SHORTCODE")?,
            mpesa_passkey:         env::var("MPESA_PASSKEY")?,
            mpesa_env:             env::var("MPESA_ENV").unwrap_or_else(|_| "sandbox".into()),

            nowpayments_api_key:        env::var("NOWPAYMENTS_API_KEY")?,
            nowpayments_ipn_secret:     env::var("NOWPAYMENTS_IPN_SECRET")?,
            nowpayments_price_currency: env::var("NOWPAYMENTS_PRICE_CURRENCY")
                .unwrap_or_else(|_| "usd".into()),

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
