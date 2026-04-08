-- Add excerpt/summary field to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS excerpt text;

COMMENT ON COLUMN products.excerpt IS '商品摘要 — short product summary (HTML), shown on product listing & top of product page';
