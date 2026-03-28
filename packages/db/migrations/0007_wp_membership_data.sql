-- Update tiers to match WordPress original membership system
-- 初心之友 (was 一般會員)
UPDATE membership_tiers SET
  name = '初心之友',
  min_spend = 0,
  discount_rate = 0.05,
  benefits = '{
    "base_discount": "95折",
    "rebate_rate": 2.3,
    "birthday_discount": "95折",
    "birthday_rebate_multiplier": 2,
    "birthday_coupon": 100,
    "description": "◎ 常態95折\n◎ 消費金額 2.3% 累積為公益存款\n◎ 生日禮券100元，當月消費公益存款雙倍累積"
  }',
  sort_order = 1
WHERE sort_order = 1;

-- 知心之友 (was 銀卡會員)
UPDATE membership_tiers SET
  name = '知心之友',
  min_spend = 3500,
  discount_rate = 0.05,
  benefits = '{
    "base_discount": "95折",
    "rebate_rate": 3.3,
    "birthday_discount": "9折",
    "birthday_rebate_multiplier": 2,
    "check_period_months": 6,
    "duration_months": 12,
    "lecture_access": true,
    "description": "◎ 常態95折\n◎ 消費金額3.3%累積為公益存款\n◎ 生日當月消費9折，公益存款雙倍累積\n◎ 線上講座與課程邀請"
  }',
  sort_order = 2
WHERE sort_order = 2;

-- 同心之友 (was 金卡會員)
UPDATE membership_tiers SET
  name = '同心之友',
  min_spend = 12000,
  discount_rate = 0.10,
  benefits = '{
    "base_discount": "9折",
    "rebate_rate": 3.3,
    "birthday_discount": "公益存款雙倍累積",
    "birthday_rebate_multiplier": 2,
    "birthday_gift": true,
    "check_period_months": 12,
    "duration_months": 24,
    "lecture_access": true,
    "event_access": true,
    "description": "◎ 常態9折\n◎ 消費金額3.3%累積為公益存款\n◎ 生日當月消費公益存款雙倍累積\n◎ 專屬生日禮\n◎ 線上與實體活動邀請"
  }',
  sort_order = 3
WHERE sort_order = 3;

-- Delete 鑽石會員 (doesn't exist in WP system)
DELETE FROM membership_tiers WHERE sort_order = 4;

-- Add charity_savings column to user_profiles for 公益存款
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS charity_savings NUMERIC(12,2) DEFAULT 0;
