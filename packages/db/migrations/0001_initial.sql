CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE membership_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  benefits JSONB,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  birthday DATE,
  tax_id TEXT,
  total_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  membership_tier_id UUID REFERENCES membership_tiers(id),
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES categories(id),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  images JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  sale_price NUMERIC(10,2),
  stock_qty INT NOT NULL DEFAULT 0,
  weight NUMERIC(8,3),
  attributes JSONB
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  guest_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','shipped','completed','cancelled','failed')),
  subtotal NUMERIC(10,2) NOT NULL,
  shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('pchomepay','linepay','jkopay')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','failed','refunded')),
  shipping_method TEXT CHECK (shipping_method IN ('cvs_711','cvs_family','home_delivery')),
  invoice_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id),
  product_snapshot JSONB NOT NULL,
  qty INT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL
);

CREATE TABLE order_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('billing','shipping')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address_type TEXT NOT NULL CHECK (address_type IN ('home','cvs')),
  cvs_store_id TEXT,
  cvs_type TEXT CHECK (cvs_type IN ('711','family')),
  address TEXT,
  city TEXT,
  postal_code TEXT
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  gateway TEXT NOT NULL,
  gateway_tx_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_response JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE logistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL DEFAULT 'ecpay',
  type TEXT NOT NULL,
  ecpay_logistics_id TEXT,
  tracking_number TEXT,
  cvs_payment_no TEXT,
  cvs_validation_no TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  raw_response JSONB
);

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL,
  merchant_trade_no TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gateway, merchant_trade_no)
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  invoice_number TEXT,
  type TEXT NOT NULL CHECK (type IN ('B2C_2','B2C_3','B2B')),
  tax_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','issued','voided')),
  amego_id TEXT,
  issued_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ
);

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('membership','replenishment')),
  interval TEXT NOT NULL CHECK (interval IN ('monthly','bimonthly')),
  price NUMERIC(10,2) NOT NULL,
  variant_id UUID REFERENCES product_variants(id),
  qty INT,
  benefits JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','cancelled','past_due')),
  payment_method TEXT NOT NULL DEFAULT 'pchomepay',
  payment_method_token TEXT,
  token_key_version INT NOT NULL DEFAULT 1,
  retry_count INT NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  order_id UUID REFERENCES orders(id),
  billing_cycle INT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('percentage','fixed')),
  value NUMERIC(10,2) NOT NULL,
  min_order NUMERIC(10,2),
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  applicable_to TEXT NOT NULL DEFAULT 'order'
    CHECK (applicable_to IN ('order','subscription','both'))
);

CREATE TABLE coupon_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id),
  user_id UUID REFERENCES auth.users(id),
  order_id UUID REFERENCES orders(id),
  subscription_id UUID REFERENCES subscriptions(id),
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_id, order_id)
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO membership_tiers (name, min_spend, discount_rate, sort_order) VALUES
  ('一般會員', 0, 0, 1),
  ('銀卡會員', 3000, 0.03, 2),
  ('金卡會員', 10000, 0.05, 3),
  ('鑽石會員', 30000, 0.08, 4);

-- FK: orders.invoice_id -> invoices (deferred because invoices is defined after orders)
ALTER TABLE orders ADD CONSTRAINT fk_orders_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id);

-- Indexes for foreign keys and commonly queried columns
CREATE INDEX idx_user_profiles_membership_tier ON user_profiles(membership_tier_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);
CREATE INDEX idx_order_addresses_order ON order_addresses(order_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_logistics_order ON logistics(order_id);
CREATE INDEX idx_logistics_status ON logistics(status);
CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date) WHERE status = 'active';
CREATE INDEX idx_subscription_orders_subscription ON subscription_orders(subscription_id);
CREATE INDEX idx_coupon_uses_coupon ON coupon_uses(coupon_id);
CREATE INDEX idx_coupon_uses_user ON coupon_uses(user_id);
CREATE INDEX idx_coupon_uses_order ON coupon_uses(order_id);
