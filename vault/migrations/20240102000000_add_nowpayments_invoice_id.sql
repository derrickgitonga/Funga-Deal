ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS nowpayments_invoice_id VARCHAR(255);
