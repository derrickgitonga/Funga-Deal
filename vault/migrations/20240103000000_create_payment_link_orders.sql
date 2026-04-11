CREATE TABLE IF NOT EXISTS payment_link_orders (
    id                     VARCHAR(255) PRIMARY KEY,
    payment_link_id        VARCHAR(255) NOT NULL,
    buyer_name             VARCHAR(255),
    buyer_email            VARCHAR(255),
    amount                 NUMERIC(12, 2) NOT NULL,
    currency               VARCHAR(10)   NOT NULL DEFAULT 'USD',
    status                 VARCHAR(50)   NOT NULL DEFAULT 'pending',
    payment_method         VARCHAR(50),
    nowpayments_invoice_id VARCHAR(255),
    mpesa_checkout_id      VARCHAR(255),
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
