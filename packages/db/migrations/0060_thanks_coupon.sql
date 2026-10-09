-- 老朋友感謝券（隨會員制度更新通知信發出）。

-- 1. 感謝券也是發給個別會員的券，跟回購券同一張表。
alter table member_coupons drop constraint if exists member_coupons_type_check;
alter table member_coupons add constraint member_coupons_type_check
  check (type in ('repurchase','referral','thanks'));

-- 2. 一位會員一輩子只有一張感謝券。
--    這張唯一索引同時是「這個人收過通知信了沒」的紀錄 —— 通知信是一次性廣播，
--    沒有訂單可以掛，與其另外建一張表，不如讓券本身當憑據：重寄時插入失敗
--    就代表寄過了，不會有人收到第二封、也不會拿到第二張券。
create unique index if not exists idx_member_coupons_thanks_once
  on member_coupons (user_id)
  where type = 'thanks';
