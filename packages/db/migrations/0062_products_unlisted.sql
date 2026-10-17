-- 不公開商品（unlisted）。
--
-- 「停售」(is_active = false) 不能拿來做「只給拿到連結的人看」：商品頁遇到
-- is_active = false 直接 404，而且結帳時 orders.ts 會把該商品的規格整個剔除，
-- 根本下不了單。上架與否是一個二選一的開關，中間沒有灰色地帶。
--
-- is_unlisted 補的就是那段灰色地帶：商品照常上架、照常結帳，但不出現在
-- 商品列表、分類頁、站內搜尋、首頁置頂、推薦區與 sitemap。只有拿到網址的人
-- 打得開，而且該頁會送 noindex，Google 不會收錄。
--
-- 用在團購主專屬價、KOL 限定組合、會員日先行開賣這種「不想被一般客人逛到，
-- 但要能買」的情境。注意它擋的是「逛到」，不是「打不開」——網址被轉傳出去
-- 一樣開得起來。要連網址都擋，得另外加一層鑰匙參數。
alter table products
  add column if not exists is_unlisted boolean not null default false;

comment on column products.is_unlisted is
  '不公開：照常上架可結帳，但不出現在任何列表／搜尋／sitemap，只有知道網址的人進得去';

-- 列表查詢一律帶 is_unlisted = false，給它一個索引；部分索引就夠，因為
-- 絕大多數商品都是公開的。
create index if not exists idx_products_unlisted
  on products (is_unlisted)
  where is_unlisted = true;
