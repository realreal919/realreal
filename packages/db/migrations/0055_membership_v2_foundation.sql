-- 誠真之友 v2 的資料表地基。
--
-- 這一支只加欄位與新表，不改任何現有行為 —— 跑完之後網站的表現與跑之前完全
-- 一樣，功能在後續各階段才接上去。
--
-- 設計上的一個決定：規格要新建的 charity_ledger 不另開表，直接擴充既有的
-- points_ledger。那張表就是現在的公益存款帳本（前台字樣「公益點數」「本次
-- 公益存款」，1 點 = NT$1，已可折抵、已有 20% 上限、未使用餘額 8,849 點）。
-- 另開一張會變成兩套餘額、兩套折抵邏輯，而舊的那套正在處理真實金額。

-- ---------------------------------------------------------------------------
-- 1. 公益存款帳本：狀態
-- ---------------------------------------------------------------------------
-- 2026-10-07 店主定調：公益優先、折抵是例外。
--
--   * 沒有「捐出」按鈕 —— 公益存款預設就是用於公益，不把捐出做成一個選項。
--   * 任何來源都不設效期（回饋、推薦、生日都一樣），沒用掉就繼續累積。
--
-- 所以這裡不做到期掃描、不做到期提醒、也沒有 expired_donated 這個狀態。
-- 年度捐出是把「累積下來還沒被折抵掉的餘額」整批結算，不是逐筆要會員決定。
--
-- status 只對「發放」那一側（delta > 0）有意義；扣抵與退回是 delta < 0 的
-- 流水，沿用原本的正負相抵，不給狀態。
--
-- 為什麼不是 enum 型別：這張表已經有 314 筆資料在跑，加 enum 要先建型別再
-- 轉欄位，中途失敗會卡在半套。text + check 的效果一樣，改規則時也只要改
-- constraint。
alter table points_ledger
  add column if not exists status text not null default 'available',
  add column if not exists settled_at timestamptz,
  add column if not exists donation_batch_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'points_ledger_status_check'
  ) then
    alter table points_ledger
      add constraint points_ledger_status_check
      check (status in ('available','redeemed','reversed','settled'));
  end if;
end $$;

comment on column points_ledger.status is
  '只對 delta > 0 的發放紀錄有意義：available 尚在帳上、redeemed 已被會員折抵、reversed 退貨回收、settled 已納入年度捐出結算。沒有效期，不會自己消失。';
comment on column points_ledger.settled_at is
  '納入年度捐出結算的時間。結算的是累積下來沒被折抵掉的餘額，不是逐筆要會員決定。';

create index if not exists idx_points_ledger_user_status
  on points_ledger (user_id, status);

-- ---------------------------------------------------------------------------
-- 2. 訂單：到貨日與是否首購
-- ---------------------------------------------------------------------------
-- delivered_at 多數時候會是推估值。7-11 出貨走交貨便批次上傳，不經站上的綠界
-- 物流整合，所以綠界的取貨回報永遠不會回來（2026-10-07 有 23 筆 COD 因此卡在
-- 待付款將近一個月）。回購提醒實務上一律是「出貨日 + repurchase.ship_to_arrival_days」。
alter table orders
  add column if not exists delivered_at timestamptz,
  add column if not exists is_first_order boolean not null default false;

comment on column orders.delivered_at is
  '到貨日。多數情況沒有真實回報，由出貨日推估；NULL 代表尚未出貨或無法推估。';
comment on column orders.is_first_order is
  '這張是否為該會員的第一張完成訂單。下單當下判定並寫死，之後不因退貨重算。';

create index if not exists idx_orders_delivered_at
  on orders (delivered_at)
  where delivered_at is not null;

-- ---------------------------------------------------------------------------
-- 3. 會員欄位
-- ---------------------------------------------------------------------------
-- received_scoop：這位會員是否已經拿過計量勺。
--
-- 2026-10-07 店主補充：還沒拿過勺的會員，在回購時也要送 —— 所以發放條件是
-- 「這個人還沒拿過」，不是「這是不是首購」。現有 261 位會員全部是 false，
-- 等於每個人下一張達門檻的訂單都會附一支。
alter table user_profiles
  add column if not exists marketing_opt_out boolean not null default false,
  add column if not exists received_scoop boolean not null default false,
  add column if not exists birthday_changed_at timestamptz,
  add column if not exists referral_code text;

comment on column user_profiles.marketing_opt_out is
  '會員已退訂行銷訊息。回購提醒、召回名單都必須排除這些人（隱私權政策的 opt-out）。';
comment on column user_profiles.received_scoop is
  '是否已附過計量勺。條件看這個欄位而不是首購與否 —— 舊會員沒拿過的，回購時補送。';
comment on column user_profiles.birthday_changed_at is
  '上次修改生日的時間。生日一年只能改一次。';

create unique index if not exists idx_user_profiles_referral_code
  on user_profiles (referral_code)
  where referral_code is not null;

-- ---------------------------------------------------------------------------
-- 4. 會員專屬優惠券（回購券）
-- ---------------------------------------------------------------------------
-- 現有的 coupons 是「共用代碼」（code / max_uses / tier_id），一組碼大家都能
-- 用。回購券是一人一張、跟著會員帳號走、不需要輸入代碼，兩者不是同一件事，
-- 所以另開一張表而不是硬塞進去。
create table if not exists member_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'repurchase',
  amount numeric not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  status text not null default 'active',
  used_order_id uuid references orders(id),
  source_order_id uuid references orders(id),
  note text,
  created_at timestamptz not null default now(),
  constraint member_coupons_status_check
    check (status in ('active','used','expired','revoked')),
  constraint member_coupons_type_check
    check (type in ('repurchase'))
);

comment on table member_coupons is
  '發給個別會員的券，不需輸入代碼。與 coupons（共用代碼）是兩回事。';

create index if not exists idx_member_coupons_user_active
  on member_coupons (user_id, status)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 5. 回購提醒
-- ---------------------------------------------------------------------------
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_order_id uuid not null references orders(id),
  type text not null default 'auto',
  channel text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  survey_answer text,
  note text,
  created_at timestamptz not null default now(),
  constraint reminders_type_check check (type in ('auto','manual_batch'))
);

-- 每位會員每張來源訂單只提醒一次。靠唯一索引擋掉重複，而不是靠排程自己記得
-- —— 排程重跑、補跑、時區切換都可能讓同一筆被挑到兩次。
create unique index if not exists idx_reminders_once_per_order
  on reminders (user_id, source_order_id, type);

-- ---------------------------------------------------------------------------
-- 6. 推薦（階段四）
-- ---------------------------------------------------------------------------
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referee_id uuid references auth.users(id) on delete set null,
  order_id uuid references orders(id),
  status text not null default 'pending',
  reject_reason text,
  points integer not null default 0,
  reward_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint referrals_status_check
    check (status in ('pending','confirmed','rejected','deferred'))
);

-- 一張訂單只能成立一次推薦。
create unique index if not exists idx_referrals_once_per_order
  on referrals (order_id)
  where order_id is not null;

create index if not exists idx_referrals_status
  on referrals (status, created_at);

alter table orders
  add column if not exists referral_code_used text,
  add column if not exists referred_by uuid references auth.users(id),
  add column if not exists referral_status text;

-- ---------------------------------------------------------------------------
-- 7. 互動紀錄（階段五）
-- ---------------------------------------------------------------------------
create table if not exists member_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  points integer not null default 0,
  link_or_note text,
  occurred_on date not null default current_date,
  recorded_by uuid references auth.users(id),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint member_interactions_status_check check (status in ('pending','confirmed','rejected')),
  constraint member_interactions_type_check
    check (type in ('referral','platform_share','testimonial','social_share','campaign_participation'))
);

-- 同一類型每月最多計 2 次，查詢都是「某人、某類型、某個月」。
create index if not exists idx_member_interactions_user_type_month
  on member_interactions (user_id, type, occurred_on);

-- ---------------------------------------------------------------------------
-- 8. 年度捐出
-- ---------------------------------------------------------------------------
create table if not exists donation_batches (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  total_amount numeric not null default 0,
  count integer not null default 0,
  recipient_name text,
  note text,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_donation_batches_year on donation_batches (year);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'points_ledger_donation_batch_fk'
  ) then
    alter table points_ledger
      add constraint points_ledger_donation_batch_fk
      foreign key (donation_batch_id) references donation_batches(id);
  end if;
end $$;
