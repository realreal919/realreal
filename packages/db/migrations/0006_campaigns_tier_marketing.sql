-- Add tier_id to coupons for tier-specific promotions
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES membership_tiers(id);
CREATE INDEX IF NOT EXISTS idx_coupons_tier ON coupons(tier_id);

-- Marketing campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  tier_id UUID REFERENCES membership_tiers(id),
  type TEXT NOT NULL DEFAULT 'discount' CHECK (type IN ('discount','freebie','points_multiplier','free_shipping','bundle')),
  config JSONB NOT NULL DEFAULT '{}',
  coupon_id UUID REFERENCES coupons(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_tier ON campaigns(tier_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(is_active, starts_at, ends_at);

-- Add richer benefits structure to existing tiers
UPDATE membership_tiers SET benefits = '{"free_shipping": false, "birthday_coupon": false, "early_access": false, "points_multiplier": 1}' WHERE name = '一般會員' AND benefits IS NULL;
UPDATE membership_tiers SET benefits = '{"free_shipping": false, "birthday_coupon": true, "early_access": false, "points_multiplier": 1.5}' WHERE name = '銀卡會員' AND benefits IS NULL;
UPDATE membership_tiers SET benefits = '{"free_shipping": true, "birthday_coupon": true, "early_access": true, "points_multiplier": 2}' WHERE name = '金卡會員' AND benefits IS NULL;
UPDATE membership_tiers SET benefits = '{"free_shipping": true, "birthday_coupon": true, "early_access": true, "points_multiplier": 3, "vip_support": true}' WHERE name = '鑽石會員' AND benefits IS NULL;
