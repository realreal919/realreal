-- 老朋友感謝券改成一次兩張（滿 1500 折 100、滿 600 折 50）。
--
-- 原本的唯一索引是 (user_id) WHERE type='thanks'，一人一張。它同時兼任
-- 「這個人收過通知信了沒」的紀錄，所以不能直接拿掉 —— 改成 (user_id, amount)：
-- 同一個金額一人仍然只能有一張，但兩種面額可以並存。重寄時照樣插入失敗。
drop index if exists idx_member_coupons_thanks_once;

create unique index if not exists idx_member_coupons_thanks_once
  on member_coupons (user_id, amount)
  where type = 'thanks';
