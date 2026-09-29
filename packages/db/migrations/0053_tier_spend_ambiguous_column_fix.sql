-- 會員等級累計／回沖：把正式庫上「只存在線上、從未進版控」的修正固化下來。
--
-- 2026-09-29 把資料庫搬到新專案時發現的：新庫是照這個目錄的 migration 重建的，
-- 結果 increment_user_tier_spend / decrement_user_tier_spend 變回 0047 的版本，
-- 而正式庫跑的是後來直接在 dashboard 熱修過的版本。兩者差兩點：
--
--   1. UPDATE 右側必須加表名限定。charity_savings / total_spend / tier_period_spend
--      同時也是 RETURNS TABLE 的輸出欄位，plpgsql 會把沒限定的名字當成變數，
--      執行期直接拋 42702 column reference is ambiguous。因為三個會員等級的
--      rebate_rate 都大於 0，increment 必定走進那段；decrement 更是無條件執行。
--      也就是說沒有這個限定，「每一筆付款成功後」的等級累計、升等、愛心存摺
--      都會失敗（tier.ts 的 incrementSpendAndUpgrade 收到錯誤會 throw），
--      退款回沖同樣壞掉。這不是邊緣情況，是 100% 觸發。
--
--   2. 愛心存摺金額用 FLOOR 不是 ROUND(…,2)：線上一直是無條件捨去到整數。
--      改成四捨五入到小數兩位會讓每一筆的金額都對不上歷史資料。
--
-- 這兩點都以正式庫 2026-09-29 當下的實際定義為準（pg_get_functiondef 原樣取出）。
-- 動這兩支之前請先確認線上定義有沒有又被手改過，不要直接覆蓋。

CREATE OR REPLACE FUNCTION public.increment_user_tier_spend(p_user_id uuid, p_amount numeric)
 RETURNS TABLE(total_spend numeric, tier_period_spend numeric, membership_tier_id uuid, charity_savings numeric, tier_changed boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_profile user_profiles%ROWTYPE;
  v_new_total NUMERIC;
  v_new_period NUMERIC;
  v_eligible membership_tiers%ROWTYPE;
  v_existing_tier UUID;
  v_existing_min_spend NUMERIC := 0;
  v_validity_months INT;
  v_expires_at TIMESTAMPTZ;
  v_rebate NUMERIC := 0;
  v_charity_increment NUMERIC := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT * INTO v_profile
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_existing_tier := v_profile.membership_tier_id;
  IF v_existing_tier IS NOT NULL THEN
    SELECT COALESCE(min_spend, 0) INTO v_existing_min_spend
    FROM membership_tiers
    WHERE id = v_existing_tier;
  END IF;
  v_new_total := COALESCE(v_profile.total_spend, 0) + p_amount;
  v_new_period := COALESCE(v_profile.tier_period_spend, 0) + p_amount;

  SELECT * INTO v_eligible
  FROM membership_tiers
  WHERE v_new_period >= min_spend
  ORDER BY min_spend DESC
  LIMIT 1;

  IF v_eligible.id IS NULL THEN
    UPDATE user_profiles
    SET total_spend = v_new_total,
        tier_period_spend = v_new_period
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;
  ELSIF v_eligible.id IS DISTINCT FROM v_existing_tier
    AND COALESCE(v_eligible.min_spend, 0) > v_existing_min_spend THEN
    v_validity_months := COALESCE(v_eligible.validity_months, 0);
    v_expires_at :=
      CASE
        WHEN v_validity_months > 0 THEN now() + make_interval(months => v_validity_months)
        ELSE NULL
      END;

    UPDATE user_profiles
    SET membership_tier_id = v_eligible.id,
        total_spend = v_new_total,
        tier_started_at = now(),
        tier_expires_at = v_expires_at,
        tier_period_spend = 0
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;
  ELSE
    UPDATE user_profiles
    SET total_spend = v_new_total,
        tier_period_spend = v_new_period
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;
  END IF;

  SELECT COALESCE(rebate_rate, 0) INTO v_rebate
  FROM membership_tiers
  WHERE id = v_profile.membership_tier_id;

  IF v_rebate > 0 THEN
    v_charity_increment := FLOOR(GREATEST(0, p_amount - 80) * (v_rebate / 100.0));
    -- RHS must be table-qualified: charity_savings is also a RETURNS TABLE
    -- column, and plpgsql treats those as variables → 42702 ambiguous.
    UPDATE user_profiles
    SET charity_savings = COALESCE(user_profiles.charity_savings, 0) + v_charity_increment
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;
  END IF;

  total_spend := v_profile.total_spend;
  tier_period_spend := v_profile.tier_period_spend;
  membership_tier_id := v_profile.membership_tier_id;
  charity_savings := COALESCE(v_profile.charity_savings, 0);
  tier_changed := v_profile.membership_tier_id IS DISTINCT FROM v_existing_tier;
  RETURN NEXT;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.decrement_user_tier_spend(p_user_id uuid, p_amount numeric)
 RETURNS TABLE(total_spend numeric, tier_period_spend numeric, charity_savings numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_profile user_profiles%ROWTYPE;
  v_rebate NUMERIC := 0;
  v_charity_decrement NUMERIC := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT * INTO v_profile
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_profile.membership_tier_id IS NOT NULL THEN
    SELECT COALESCE(rebate_rate, 0) INTO v_rebate
    FROM membership_tiers
    WHERE id = v_profile.membership_tier_id;
  END IF;

  IF v_rebate > 0 THEN
    v_charity_decrement := FLOOR(GREATEST(0, p_amount - 80) * (v_rebate / 100.0));
  END IF;

  -- RHS table-qualified: these three are also RETURNS TABLE columns (42702).
  UPDATE user_profiles
  SET total_spend = GREATEST(0, COALESCE(user_profiles.total_spend, 0) - p_amount),
      tier_period_spend = GREATEST(0, COALESCE(user_profiles.tier_period_spend, 0) - p_amount),
      charity_savings = GREATEST(0, COALESCE(user_profiles.charity_savings, 0) - v_charity_decrement)
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  total_spend := v_profile.total_spend;
  tier_period_spend := v_profile.tier_period_spend;
  charity_savings := COALESCE(v_profile.charity_savings, 0);
  RETURN NEXT;
END;
$function$

;
