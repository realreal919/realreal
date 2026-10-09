-- 回饋信 + 回購券改版（2026-10-09 店主定案的信件內容）。

-- 1. 回購券現在有「專屬優惠碼」與「滿額門檻」。
--    信裡寫了「優惠碼｜XXX」「使用門檻｜滿 1500」，券就必須真的有這兩件事。
alter table member_coupons add column if not exists code text;
alter table member_coupons add column if not exists min_order numeric not null default 0;

-- 碼要全站唯一 —— 客人打進結帳頁的那一刻，系統得知道是誰的券。
create unique index if not exists idx_member_coupons_code
  on member_coupons (code)
  where code is not null;

-- 2. 回饋信也走 reminders 擋重複，type 要放行。
alter table reminders drop constraint if exists reminders_type_check;
alter table reminders add constraint reminders_type_check
  check (type in ('auto','manual_batch','feedback'));
