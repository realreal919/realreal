-- 發票通知信的寄送紀錄。
--
-- 背景：開票時沒有把買受人 email 傳給光貿（見 apps/api/src/lib/issue-invoice.ts
-- 2026-10-19 的修正），所以從上線到 10/20，光貿一封發票通知信都沒有寄出去。
-- 沒有載具、也沒有捐贈的客人等於完全拿不到自己的發票號碼，站上有 136 張。
--
-- 補寄是分批進行的（寄信服務一天有上限），所以需要記住「這張已經通知過了」，
-- 否則第二天再跑一次會把昨天那批再寄一遍。記在發票上而不是另開一張表：
-- 「這張發票有沒有通知到買受人」本來就是發票自己的狀態。
--
-- 往後若要讓系統自動補寄，也是看這個欄位。
alter table invoices
  add column if not exists notice_sent_at timestamptz;

comment on column invoices.notice_sent_at is
  '已寄出發票通知信給買受人的時間；null = 還沒通知過';

-- 補寄名單的查詢條件是「notice_sent_at is null」，給它一個部分索引。
create index if not exists idx_invoices_notice_pending
  on invoices (issued_at)
  where notice_sent_at is null;
