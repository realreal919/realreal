-- 分享回報的收件匣。
--
-- 會員把自己做過的分享（連結或截圖）傳給誠真，管理者每週看一次、判斷類型與
-- 記點。階段一管理者在 Google Sheet 上作業，所以這張表只負責「收件」：
-- 時間、是誰、連結、截圖、想說的話。狀態／類型／點數那幾欄留在 Sheet，
-- 階段二才搬進 member_interactions。
--
-- 為什麼不直接寫 member_interactions：那張表的 user_id 不可為空、type 有
-- CHECK 限制，但這個表單**允許非會員送出**（填 Email 讓管理者事後對應），
-- 而且類型是管理者看過才決定的。硬塞進去要先把那些限制拆掉，反而把階段二
-- 的資料結構弄髒。
create table if not exists share_reports (
  id uuid primary key default gen_random_uuid(),
  -- 已登入會員才有；未登入送出時為空，靠 email 對應
  user_id uuid references auth.users(id) on delete set null,
  email text,
  link text,
  screenshot_url text,
  message text,
  -- 同一個連結先前出現過 → 管理者直接選「不計」
  is_duplicate boolean not null default false,
  -- 階段二會用到；階段一由 Sheet 管，這裡先留著不寫
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  constraint share_reports_status_check check (status in ('pending','counted','rejected')),
  -- 連結與截圖至少要有一個，否則這筆回報沒有任何可查證的內容
  constraint share_reports_has_content check (
    coalesce(nullif(trim(link), ''), nullif(trim(screenshot_url), '')) is not null
  )
);

comment on table share_reports is
  '分享回報收件匣。管理者在 Google Sheet 上判斷類型與記點（階段一），這裡只存會員送出的原始內容。';
comment on column share_reports.is_duplicate is
  '同一個連結曾經送出過。送出當下判定並寫死 —— 事後再算的話，先後順序會隨查詢時間變動。';

create index if not exists idx_share_reports_created on share_reports (created_at desc);
create index if not exists idx_share_reports_link on share_reports (link) where link is not null;

-- 會員自己送出的回報由 API（service_role）寫入，前台不直接寫這張表，
-- 所以開 RLS 但不給任何 policy：anon / authenticated 讀不到也寫不了。
alter table share_reports enable row level security;
