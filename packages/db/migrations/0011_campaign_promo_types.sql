-- Expand campaign types to support more common promotion patterns
-- Adding: buy_x_get_y, second_half_price, spend_threshold, tier_upgrade_bonus, combo_discount

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_type_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_type_check CHECK (
  type IN (
    'discount',           -- 全館/指定分類折扣
    'freebie',            -- 滿額贈品
    'points_multiplier',  -- 公益存款/點數加倍
    'free_shipping',      -- 免運費
    'bundle',             -- 組合優惠 (買N送M)
    'buy_x_get_y',        -- 買X件送Y件 (同商品或跨商品)
    'second_half_price',  -- 第二件半價 / 第二件X折
    'spend_threshold',    -- 滿額折扣 (滿1000折100)
    'tier_upgrade_bonus', -- 升等加碼
    'combo_discount'      -- 任選N件M折
  )
);

-- Seed common promotion templates
INSERT INTO campaigns (name, description, type, config, is_active, starts_at, ends_at)
VALUES
  (
    '買一送一 — 蛋白粉系列',
    '指定蛋白粉商品，買一包送一包同品項',
    'buy_x_get_y',
    '{"buy_quantity": 1, "get_quantity": 1, "scope": "specific_categories", "category_slug": "protein", "same_item_only": true, "max_uses_per_order": 1}',
    false,
    now(),
    null
  ),
  (
    '買三送二 — 凍乾水果',
    '凍乾水果系列，買三包送兩包（取低價品）',
    'buy_x_get_y',
    '{"buy_quantity": 3, "get_quantity": 2, "scope": "specific_categories", "category_slug": "freeze-dried", "same_item_only": false, "free_item_rule": "lowest_price", "max_uses_per_order": 1}',
    false,
    now(),
    null
  ),
  (
    '第二件半價',
    '全館商品第二件享半價優惠',
    'second_half_price',
    '{"discount_percent": 50, "scope": "all", "applies_to": "cheapest", "max_pairs": 1}',
    false,
    now(),
    null
  ),
  (
    '第二件6折',
    '蛋白粉系列第二件6折',
    'second_half_price',
    '{"discount_percent": 40, "scope": "specific_categories", "category_slug": "protein", "applies_to": "cheapest", "max_pairs": 1}',
    false,
    now(),
    null
  ),
  (
    '滿千折百',
    '訂單滿 $1,000 現折 $100',
    'spend_threshold',
    '{"min_amount": 1000, "discount_amount": 100, "stackable": false}',
    false,
    now(),
    null
  ),
  (
    '滿 $2,000 折 $300',
    '訂單滿 $2,000 折 $300，可與會員折扣疊加',
    'spend_threshold',
    '{"min_amount": 2000, "discount_amount": 300, "stackable": true}',
    false,
    now(),
    null
  ),
  (
    '全館95折',
    '全站商品享95折優惠',
    'discount',
    '{"discount_method": "percent", "discount_value": 5, "scope": "all"}',
    false,
    now(),
    null
  ),
  (
    '任選3件88折',
    '全館任選3件享88折',
    'combo_discount',
    '{"min_items": 3, "discount_percent": 12, "scope": "all", "mix_match": true}',
    false,
    now(),
    null
  ),
  (
    '任選5件8折',
    '凍乾水果任選5件享8折',
    'combo_discount',
    '{"min_items": 5, "discount_percent": 20, "scope": "specific_categories", "category_slug": "freeze-dried", "mix_match": true}',
    false,
    now(),
    null
  ),
  (
    '免運活動',
    '全館消費滿 $800 即享免運',
    'free_shipping',
    '{"min_order_amount": 800}',
    true,
    now(),
    null
  ),
  (
    '知心之友點數雙倍',
    '知心之友等級以上公益存款雙倍累積',
    'points_multiplier',
    '{"multiplier": 2, "scope": "all"}',
    false,
    now(),
    null
  ),
  (
    '滿額贈品 — 滿$1,500送凍乾試吃包',
    '訂單滿$1,500贈送凍乾水果試吃包乙份',
    'freebie',
    '{"min_order_amount": 1500, "gift_name": "凍乾水果試吃包", "gift_sku": "RR-FD-SAMPLE", "gift_qty": 1}',
    false,
    now(),
    null
  );
