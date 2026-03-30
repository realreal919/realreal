-- Seed: categories, products, and product_variants for realreal.cc
-- 4 categories, ~23 products, ~40+ variants

-- ============================================================
-- Categories
-- ============================================================
INSERT INTO categories (id, name, slug, sort_order) VALUES
  (gen_random_uuid(), '純植物蛋白粉', 'protein', 1),
  (gen_random_uuid(), '原相凍乾水果', 'freeze-dried', 2),
  (gen_random_uuid(), '禮盒組合', 'gift-sets', 3),
  (gen_random_uuid(), '訂閱專區', 'subscription', 4);

-- ============================================================
-- Products + Variants  (use CTEs to resolve category IDs)
-- ============================================================

-- Helper: grab category IDs once
WITH
  cat AS (
    SELECT id, slug FROM categories
    WHERE slug IN ('protein', 'freeze-dried', 'gift-sets', 'subscription')
  ),
  cat_protein      AS (SELECT id FROM cat WHERE slug = 'protein'),
  cat_freeze_dried AS (SELECT id FROM cat WHERE slug = 'freeze-dried'),
  cat_gift_sets    AS (SELECT id FROM cat WHERE slug = 'gift-sets'),
  cat_subscription AS (SELECT id FROM cat WHERE slug = 'subscription'),

-- ============================================================
-- PROTEIN PRODUCTS
-- ============================================================
  ins_pro AS (
    INSERT INTO products (id, name, slug, description, category_id, images, is_active)
    VALUES
      (gen_random_uuid(), '豌豆分離蛋白（原味）', 'pea-protein-original',
       '嚴選加拿大非基改黃豌豆，分離萃取高純度蛋白質，無添加人工香料與甜味劑。每份含25g優質植物蛋白，好吸收、無豆腥味。',
       (SELECT id FROM cat_protein),
       '[{"url": "/products/pea-protein-original.jpg", "alt": "豌豆分離蛋白原味", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '豌豆分離蛋白（可可）', 'pea-protein-cocoa',
       '嚴選加拿大非基改黃豌豆搭配荷蘭可可粉，濃郁巧克力風味。每份含25g植物蛋白，運動後補充或早餐替代皆宜。',
       (SELECT id FROM cat_protein),
       '[{"url": "/products/pea-protein-cocoa.jpg", "alt": "豌豆分離蛋白可可", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '豌豆分離蛋白（抹茶）', 'pea-protein-matcha',
       '嚴選加拿大非基改黃豌豆搭配日本靜岡抹茶，清新茶韻。每份含25g植物蛋白，適合喜愛抹茶風味的你。',
       (SELECT id FROM cat_protein),
       '[{"url": "/products/pea-protein-matcha.jpg", "alt": "豌豆分離蛋白抹茶", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '糙米蛋白（原味）', 'brown-rice-protein-original',
       '台灣在地糙米發芽萃取，富含完整胺基酸。口感細緻易溶解，適合腸胃敏感族群。每份含20g植物蛋白。',
       (SELECT id FROM cat_protein),
       '[{"url": "/products/brown-rice-protein-original.jpg", "alt": "糙米蛋白原味", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '綜合植物蛋白（莓果）', 'blend-protein-berry',
       '豌豆蛋白 × 糙米蛋白 × 南瓜籽蛋白三重配方，搭配天然莓果風味。完整胺基酸組合，每份含22g植物蛋白。',
       (SELECT id FROM cat_protein),
       '[{"url": "/products/blend-protein-berry.jpg", "alt": "綜合植物蛋白莓果", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '膠原蛋白胜肽（無調味）', 'collagen-peptide-plain',
       '小分子膠原蛋白胜肽，3000 Da低分子量好吸收。無調味設計可加入任何飲品，每日一包養顏美容。',
       (SELECT id FROM cat_protein),
       '[{"url": "/products/collagen-peptide-plain.jpg", "alt": "膠原蛋白胜肽無調味", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '高蛋白燕麥粥（可可）', 'protein-oatmeal-cocoa',
       '澳洲有機燕麥搭配豌豆蛋白與可可粉，沖泡即食。每份含15g蛋白質與豐富膳食纖維，忙碌早晨的完美選擇。',
       (SELECT id FROM cat_protein),
       '[{"url": "/products/protein-oatmeal-cocoa.jpg", "alt": "高蛋白燕麥粥可可", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '植物蛋白隨身包 綜合體驗組', 'protein-sampler-pack',
       '一次嚐遍所有口味！內含原味、可可、抹茶、莓果各2包，共8包入。送禮自用兩相宜的最佳入門選擇。',
       (SELECT id FROM cat_protein),
       '[{"url": "/products/protein-sampler-pack.jpg", "alt": "植物蛋白綜合體驗組", "sort_order": 0}]'::jsonb,
       TRUE)
    RETURNING id, slug
  ),

-- ============================================================
-- FREEZE-DRIED PRODUCTS
-- ============================================================
  ins_fd AS (
    INSERT INTO products (id, name, slug, description, category_id, images, is_active)
    VALUES
      (gen_random_uuid(), '凍乾草莓', 'freeze-dried-strawberry',
       '嚴選大湖草莓，急速冷凍乾燥保留95%以上營養與天然色澤。酥脆口感，無添加糖與防腐劑。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-strawberry.jpg", "alt": "凍乾草莓", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾芒果', 'freeze-dried-mango',
       '台南愛文芒果產地直送，凍乾鎖住熱帶甜蜜滋味。每一口都是陽光的味道，零食、烘焙皆適用。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-mango.jpg", "alt": "凍乾芒果", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾藍莓', 'freeze-dried-blueberry',
       '北美進口高品質藍莓，富含花青素。凍乾後風味濃縮，可直接食用或加入優格、麥片。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-blueberry.jpg", "alt": "凍乾藍莓", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾鳳梨', 'freeze-dried-pineapple',
       '屏東金鑽鳳梨，酸甜適中。凍乾技術完整保留鳳梨酵素與膳食纖維，爽脆口感一吃就愛。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-pineapple.jpg", "alt": "凍乾鳳梨", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾蘋果', 'freeze-dried-apple',
       '日本富士蘋果品種，台灣高山栽培。凍乾後呈現自然甜味與清新果香，大人小孩都喜歡。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-apple.jpg", "alt": "凍乾蘋果", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾綜合莓果', 'freeze-dried-mixed-berries',
       '草莓、藍莓、蔓越莓、覆盆子四種莓果一次滿足。繽紛色彩與多層次果香，補充滿滿花青素。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-mixed-berries.jpg", "alt": "凍乾綜合莓果", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾綜合熱帶水果', 'freeze-dried-tropical-mix',
       '芒果、鳳梨、百香果、火龍果熱帶四重奏。一包嚐遍南國水果精華，派對分享最佳選擇。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-tropical-mix.jpg", "alt": "凍乾綜合熱帶水果", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾水果穀物脆片', 'freeze-dried-fruit-granola',
       '凍乾水果搭配烘烤燕麥與堅果，高纖低糖。倒入牛奶或植物奶即成營養早餐，方便又美味。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-fruit-granola.jpg", "alt": "凍乾水果穀物脆片", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾水果優格球', 'freeze-dried-fruit-yogurt-bites',
       '希臘優格包裹凍乾水果，外層再裹上一層凍乾優格粉。酸甜交織的完美零食，冷藏更好吃。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-fruit-yogurt-bites.jpg", "alt": "凍乾水果優格球", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾水果茶包（綜合）', 'freeze-dried-fruit-tea',
       '凍乾草莓、蘋果、鳳梨切丁混合花草茶，熱沖冷泡皆宜。12入獨立包裝，辦公室下午茶首選。',
       (SELECT id FROM cat_freeze_dried),
       '[{"url": "/products/fd-fruit-tea.jpg", "alt": "凍乾水果茶包綜合", "sort_order": 0}]'::jsonb,
       TRUE)
    RETURNING id, slug
  ),

-- ============================================================
-- GIFT SET PRODUCTS
-- ============================================================
  ins_gs AS (
    INSERT INTO products (id, name, slug, description, category_id, images, is_active)
    VALUES
      (gen_random_uuid(), '蛋白粉精選禮盒', 'gift-protein-selection',
       '精選三款人氣蛋白粉（原味、可可、抹茶）各10包入，搭配品牌搖搖杯。質感禮盒包裝，送給注重健康的摯友。',
       (SELECT id FROM cat_gift_sets),
       '[{"url": "/products/gift-protein-selection.jpg", "alt": "蛋白粉精選禮盒", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '凍乾水果精選禮盒', 'gift-fruit-selection',
       '嚴選五款人氣凍乾水果：草莓、芒果、藍莓、鳳梨、蘋果各一份。繽紛水果禮盒，健康送禮新選擇。',
       (SELECT id FROM cat_gift_sets),
       '[{"url": "/products/gift-fruit-selection.jpg", "alt": "凍乾水果精選禮盒", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '健康生活禮盒（蛋白+凍乾組合）', 'gift-healthy-living',
       '植物蛋白粉（可可）10包 + 凍乾綜合莓果 + 凍乾綜合熱帶水果。運動與日常兼顧的全方位健康禮盒。',
       (SELECT id FROM cat_gift_sets),
       '[{"url": "/products/gift-healthy-living.jpg", "alt": "健康生活禮盒", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '新手入門體驗組', 'gift-starter-kit',
       '不知道從哪裡開始？這組幫你搞定！蛋白粉體驗包4入 + 凍乾水果迷你包3入 + 品牌束口袋。',
       (SELECT id FROM cat_gift_sets),
       '[{"url": "/products/gift-starter-kit.jpg", "alt": "新手入門體驗組", "sort_order": 0}]'::jsonb,
       TRUE),

      (gen_random_uuid(), '年節限定禮盒', 'gift-lunar-new-year',
       '農曆新年限定！金色禮盒內含蛋白粉精選3入 + 凍乾水果精選5入 + 限定紅包袋。數量有限，送完為止。',
       (SELECT id FROM cat_gift_sets),
       '[{"url": "/products/gift-lunar-new-year.jpg", "alt": "年節限定禮盒", "sort_order": 0}]'::jsonb,
       TRUE)
    RETURNING id, slug
  )

-- ============================================================
-- PRODUCT VARIANTS
-- ============================================================
INSERT INTO product_variants (id, product_id, sku, name, price, sale_price, stock_qty, weight, attributes)
VALUES
  -- === 豌豆分離蛋白（原味）===
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'pea-protein-original'), 'RR-PRO-001', '30包入', 2480.00, 2280.00, 150, 900.000, '{"size": "30包", "flavor": "原味"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'pea-protein-original'), 'RR-PRO-002', '10包入', 890.00, NULL, 200, 300.000, '{"size": "10包", "flavor": "原味"}'::jsonb),

  -- === 豌豆分離蛋白（可可）===
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'pea-protein-cocoa'), 'RR-PRO-003', '30包入', 2480.00, 2280.00, 120, 900.000, '{"size": "30包", "flavor": "可可"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'pea-protein-cocoa'), 'RR-PRO-004', '10包入', 890.00, NULL, 180, 300.000, '{"size": "10包", "flavor": "可可"}'::jsonb),

  -- === 豌豆分離蛋白（抹茶）===
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'pea-protein-matcha'), 'RR-PRO-005', '30包入', 2580.00, 2380.00, 100, 900.000, '{"size": "30包", "flavor": "抹茶"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'pea-protein-matcha'), 'RR-PRO-006', '10包入', 920.00, NULL, 160, 300.000, '{"size": "10包", "flavor": "抹茶"}'::jsonb),

  -- === 糙米蛋白（原味）===
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'brown-rice-protein-original'), 'RR-PRO-007', '30包入', 2280.00, NULL, 80, 900.000, '{"size": "30包", "flavor": "原味"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'brown-rice-protein-original'), 'RR-PRO-008', '10包入', 850.00, NULL, 120, 300.000, '{"size": "10包", "flavor": "原味"}'::jsonb),

  -- === 綜合植物蛋白（莓果）===
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'blend-protein-berry'), 'RR-PRO-009', '30包入', 2680.00, 2480.00, 90, 900.000, '{"size": "30包", "flavor": "莓果"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'blend-protein-berry'), 'RR-PRO-010', '10包入', 950.00, NULL, 140, 300.000, '{"size": "10包", "flavor": "莓果"}'::jsonb),

  -- === 膠原蛋白胜肽（無調味）===
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'collagen-peptide-plain'), 'RR-PRO-011', '30包入', 2380.00, 2180.00, 100, 450.000, '{"size": "30包", "flavor": "無調味"}'::jsonb),

  -- === 高蛋白燕麥粥（可可）===
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'protein-oatmeal-cocoa'), 'RR-PRO-012', '10包入', 680.00, NULL, 150, 500.000, '{"size": "10包", "flavor": "可可"}'::jsonb),

  -- === 植物蛋白隨身包 綜合體驗組 ===
  (gen_random_uuid(), (SELECT id FROM ins_pro WHERE slug = 'protein-sampler-pack'), 'RR-PRO-013', '8包入（4口味各2包）', 580.00, NULL, 200, 240.000, '{"size": "8包", "flavor": "綜合"}'::jsonb),

  -- === 凍乾草莓 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-strawberry'), 'RR-FD-001', '50g', 280.00, NULL, 200, 50.000, '{"size": "50g"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-strawberry'), 'RR-FD-002', '100g', 480.00, 450.00, 150, 100.000, '{"size": "100g"}'::jsonb),

  -- === 凍乾芒果 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-mango'), 'RR-FD-003', '50g', 260.00, NULL, 180, 50.000, '{"size": "50g"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-mango'), 'RR-FD-004', '100g', 450.00, 420.00, 130, 100.000, '{"size": "100g"}'::jsonb),

  -- === 凍乾藍莓 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-blueberry'), 'RR-FD-005', '50g', 320.00, NULL, 160, 50.000, '{"size": "50g"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-blueberry'), 'RR-FD-006', '100g', 560.00, 520.00, 110, 100.000, '{"size": "100g"}'::jsonb),

  -- === 凍乾鳳梨 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-pineapple'), 'RR-FD-007', '50g', 240.00, NULL, 170, 50.000, '{"size": "50g"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-pineapple'), 'RR-FD-008', '100g', 420.00, NULL, 120, 100.000, '{"size": "100g"}'::jsonb),

  -- === 凍乾蘋果 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-apple'), 'RR-FD-009', '50g', 220.00, NULL, 190, 50.000, '{"size": "50g"}'::jsonb),
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-apple'), 'RR-FD-010', '100g', 380.00, NULL, 140, 100.000, '{"size": "100g"}'::jsonb),

  -- === 凍乾綜合莓果 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-mixed-berries'), 'RR-FD-011', '100g', 520.00, 480.00, 100, 100.000, '{"size": "100g"}'::jsonb),

  -- === 凍乾綜合熱帶水果 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-tropical-mix'), 'RR-FD-012', '100g', 480.00, 450.00, 110, 100.000, '{"size": "100g"}'::jsonb),

  -- === 凍乾水果穀物脆片 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-fruit-granola'), 'RR-FD-013', '150g', 380.00, NULL, 130, 150.000, '{"size": "150g"}'::jsonb),

  -- === 凍乾水果優格球 ===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-fruit-yogurt-bites'), 'RR-FD-014', '80g', 320.00, NULL, 140, 80.000, '{"size": "80g"}'::jsonb),

  -- === 凍乾水果茶包（綜合）===
  (gen_random_uuid(), (SELECT id FROM ins_fd WHERE slug = 'freeze-dried-fruit-tea'), 'RR-FD-015', '12入', 350.00, NULL, 160, 120.000, '{"size": "12入"}'::jsonb),

  -- === 蛋白粉精選禮盒 ===
  (gen_random_uuid(), (SELECT id FROM ins_gs WHERE slug = 'gift-protein-selection'), 'RR-GS-001', '標準版', 2980.00, 2680.00, 60, 1800.000, '{"type": "禮盒"}'::jsonb),

  -- === 凍乾水果精選禮盒 ===
  (gen_random_uuid(), (SELECT id FROM ins_gs WHERE slug = 'gift-fruit-selection'), 'RR-GS-002', '標準版', 1580.00, 1380.00, 80, 500.000, '{"type": "禮盒"}'::jsonb),

  -- === 健康生活禮盒 ===
  (gen_random_uuid(), (SELECT id FROM ins_gs WHERE slug = 'gift-healthy-living'), 'RR-GS-003', '標準版', 2280.00, 1980.00, 50, 1200.000, '{"type": "禮盒"}'::jsonb),

  -- === 新手入門體驗組 ===
  (gen_random_uuid(), (SELECT id FROM ins_gs WHERE slug = 'gift-starter-kit'), 'RR-GS-004', '標準版', 1280.00, NULL, 100, 600.000, '{"type": "體驗組"}'::jsonb),

  -- === 年節限定禮盒 ===
  (gen_random_uuid(), (SELECT id FROM ins_gs WHERE slug = 'gift-lunar-new-year'), 'RR-GS-005', '限定版', 3180.00, 2880.00, 50, 2000.000, '{"type": "限定禮盒"}'::jsonb);
