-- 推薦獎勵（階段四）。
--
-- 0055 已經建好 referrals、user_profiles.referral_code 與 orders 上的推薦欄位，
-- 這支只補接線時才發現缺的三件事。

-- 1. 新朋友的 50 元購物金也是發給個別會員的券，跟回購券同一張表。
--    原本的 check 只允許 'repurchase'，不放寬就插不進去。
alter table member_coupons drop constraint if exists member_coupons_type_check;
alter table member_coupons add constraint member_coupons_type_check
  check (type in ('repurchase','referral'));

-- 2. 推薦人的回饋金記在 points_ledger（公益存款就是這張表）。source 是封閉
--    清單，不放進去就寫不了。獨立一個 source 而不是借用 promo —— 之後要回答
--    「推薦獎勵總共發了多少」時，混在 promo 裡就分不出來了。
alter table points_ledger drop constraint if exists points_ledger_source_check;
alter table points_ledger add constraint points_ledger_source_check
  check (source in ('earn','redeem','expire','refund','manual_adjust','promo','referral'));

-- 3. 同一張訂單只能發一次推薦回饋。post-payment 會重跑、補跑，沒有這個索引
--    就會對同一筆訂單再記一次 50 點。做法跟 0032 的 earn/redeem 一樣。
create unique index if not exists idx_points_ledger_referral_once
  on points_ledger (source_ref_id)
  where source = 'referral' and source_ref_id is not null;

-- 4. 同一位新朋友一輩子只能被推薦成功一次。referrals 原本只擋到「同一張訂單」，
--    沒擋「同一個人用不同訂單被推薦兩次」—— 第一張單沒滿 650 標成 deferred，
--    第二張單又帶同一組碼進來，就會再發一次。
create unique index if not exists idx_referrals_once_per_referee
  on referrals (referee_id)
  where referee_id is not null and status = 'confirmed';
