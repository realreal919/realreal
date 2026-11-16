-- 到貨通知（2026-11-17 店主指定）
--
-- 缺貨的商品頁讓客人留下信箱，貨到了由店主在後台按一次「通知他們」才寄信。
-- 不自動寄 —— 補貨當下數量常常不夠所有人（可可就是這樣），自動寄等於同時叫
-- 幾十個人來搶幾包貨，先到的買到、其他人收到一封空歡喜的信。
--
-- 執行方式：Supabase 後台 → SQL Editor → 貼上整段 → Run。

create table if not exists restock_subscriptions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  email text not null,
  -- 登入的客人留下 user_id，訪客就是 null。只拿來看是誰留的，通知一律寄 email。
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- 寄出通知的時間。null = 還在等貨。
  notified_at timestamptz
);

-- 同一個商品、同一個信箱，只能有一筆「還在等」的登記。
-- 客人按兩次、或隔天又來按一次，都不該變成兩封信。
create unique index if not exists uniq_restock_pending
  on restock_subscriptions (product_id, lower(email))
  where notified_at is null;

-- 後台列表只看還在等的那些，按商品分組。
create index if not exists idx_restock_pending_product
  on restock_subscriptions (product_id)
  where notified_at is null;

-- 這張表只由 API（service role）讀寫。
-- 沒有任何 policy = 匿名與登入客戶端都碰不到：留下來的信箱是別人的個資，
-- 前台沒有任何需要「讀取名單」的畫面，開了只會多一條外洩路徑。
alter table restock_subscriptions enable row level security;
