-- Add three WYSIWYG content columns migrated from WordPress ACF "商品三欄" fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_left TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_middle TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_right TEXT;

COMMENT ON COLUMN products.shop_left IS '商品左欄 — marketing copy, benefits, usage instructions (HTML)';
COMMENT ON COLUMN products.shop_middle IS '商品中欄 — ingredients, allergens, specs, nutrition (HTML)';
COMMENT ON COLUMN products.shop_right IS '商品右欄 — brand values, charity info, storage instructions (HTML)';
