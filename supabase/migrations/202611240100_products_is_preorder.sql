-- 預購商品：不檢查庫存的開關。
--
-- 組合規格的可售數量是從配方回推單品庫存算出來的（lib/pack-stock.ts 與
-- migration 0056 的 resolve_stock_targets）。那條規則對現貨是對的，對預購正好
-- 相反 —— 預購賣的就是「現在沒有、等到貨」，可可／杏仁火龍果／芝麻藍莓的
-- 300 克單袋現在都是 0，預購組於是整個變成缺貨，等於預購區只剩一半能賣。
--
-- 這個旗標讓前台跳過可售數量換算、結帳跳過扣庫存與回補。預購商品的庫存因此
-- 不會變動，也不該拿它對帳 —— 預購要出多少貨看的是訂單，不是庫存欄位。
alter table products
  add column if not exists is_preorder boolean not null default false;

comment on column products.is_preorder is
  '預購商品：前台不從配方回推可售數量，結帳不扣庫存也不回補。';

-- 預購商品區目前的三個商品（2026-11-24 店主規劃）
update products
   set is_preorder = true
 where slug in ('protein-5pack', 'protein-10pack-60day', 'protein-30pack-mix');
