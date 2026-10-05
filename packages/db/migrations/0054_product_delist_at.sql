-- 商品到期自動下架。
--
-- 限時檔期原本只有前台的倒數框會在時間到時消失，商品本身還留在架上照常賣
-- （2026-10-04 的 30 天組合就是這樣，倒數跑完隔天還買得到，店主手動下架）。
-- 把結束時間放在商品上，排程到時間就把 is_active 設為 false，倒數框也讀同
-- 一個欄位，兩邊不會再各自為政。
--
-- NULL = 沒有檔期，排程一律不碰。只會下架、不會上架 —— 誤填一個過去的時間
-- 最壞是商品被下架（看得到、改得回來），不會變成應該停賣的東西又自己上架。
alter table products
  add column if not exists delist_at timestamptz;

comment on column products.delist_at is
  '自動下架時間；NULL = 不自動下架。排程每小時檢查，到期將 is_active 設為 false。';

-- 排程每小時只關心「有填時間且還在架上」的那幾筆，用部分索引避免整表掃描。
create index if not exists idx_products_delist_at
  on products (delist_at)
  where delist_at is not null and is_active = true;
