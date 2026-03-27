ALTER TABLE invoices ADD COLUMN IF NOT EXISTS carrier_type TEXT CHECK (carrier_type IN ('phone', 'natural_person', 'love_code'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS carrier_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS love_code TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_title TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS random_code TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON invoices(issued_at DESC) WHERE issued_at IS NOT NULL;
