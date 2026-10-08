-- 組合規格的庫存由單品換算，不再各自記一個數字。
--
-- 現況的問題：每個 product_variant 各有一個獨立的 stock_qty，賣出「草莓 5入組」
-- 只會扣 5入組自己的計數器，不會動到「草莓 單袋」。兩個數字從來不同步，所以
-- 2026-10-08 盤點時「草莓 300克 單袋」只剩 20 袋，而「草莓 5入組」顯示 100
-- —— 理論上可以再賣出 500 袋。
--
-- 改法：組合規格不再持有庫存，改持有「配方」：
--     attributes.pack_of = { "variant_id": "<單品規格>", "qty": N }
-- 扣庫存與回補時先把配方展開成單品，再對單品那一個計數器加減。實體上只有
-- 一種東西（一袋 300 克草莓），就只該有一個計數器。
--
-- 沒有 pack_of 的規格行為完全不變，所以這支可以安全套用在現有資料上 ——
-- 回填 attributes 之前，一切照舊。

-- ---------------------------------------------------------------------------
-- 把購物車的 [{id, qty}] 展開成「實際要異動的單品規格與數量」
-- ---------------------------------------------------------------------------
-- 同一個單品可能被多列指到（例如同時買「單袋 ×2」與「5入組 ×1」），所以要
-- 先依目標聚合再異動，否則第二次 UPDATE 會以第一次之後的餘額重新判斷，
-- 兩筆都「剛好夠」卻合計不夠。
create or replace function resolve_stock_targets(p_variants jsonb)
returns table(target_id uuid, total_qty int)
language sql
stable
as $$
  select
    coalesce((v.attributes -> 'pack_of' ->> 'variant_id')::uuid, v.id) as target_id,
    sum(
      (elem->>'qty')::int
      * coalesce((v.attributes -> 'pack_of' ->> 'qty')::int, 1)
    )::int as total_qty
  from jsonb_array_elements(p_variants) as elem
  join product_variants v on v.id = (elem->>'id')::uuid
  group by 1
$$;

comment on function resolve_stock_targets is
  '把購物車明細展開成實際要加減庫存的單品規格。組合規格靠 attributes.pack_of 指向單品與每組數量；沒有 pack_of 的就是它自己、倍數 1。';

-- ---------------------------------------------------------------------------
-- 扣庫存
-- ---------------------------------------------------------------------------
create or replace function atomic_deduct_stock(p_variants jsonb)
returns boolean
language plpgsql
as $$
declare
  v_ids      uuid[];
  v_rec      record;
  v_affected int;
begin
  -- 購物車帶進不存在的規格要出錯。resolve_stock_targets 用 JOIN，認不得的 id
  -- 會被默默丟掉，不補這道檢查的話就是「訂單成立、庫存沒扣」—— 舊版是靠
  -- UPDATE 影響 0 列擋下來的。
  if exists (
    select 1
      from jsonb_array_elements(p_variants) as elem
     where not exists (
       select 1 from product_variants v where v.id = (elem->>'id')::uuid
     )
  ) then
    raise exception 'unknown variant in cart' using errcode = 'P0001';
  end if;

  select array_agg(target_id order by target_id)
    into v_ids
    from resolve_stock_targets(p_variants);

  -- 先一次鎖住所有目標列，順序固定，避免兩筆同時結帳互相等待。
  perform 1
     from product_variants
    where id = any(v_ids)
    order by id
      for update;

  for v_rec in select target_id, total_qty from resolve_stock_targets(p_variants)
  loop
    update product_variants
       set stock_qty = stock_qty - v_rec.total_qty
     where id = v_rec.target_id
       and stock_qty >= v_rec.total_qty;
    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      raise exception 'insufficient stock for variant %', v_rec.target_id using errcode = 'P0001';
    end if;
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 回補庫存（訂單建立失敗、取消、退貨）
-- ---------------------------------------------------------------------------
-- 要跟扣庫存走同一套展開，否則賣出時扣單品、取消時補回組合規格，庫存會憑空
-- 多出來。
-- 回傳型別維持 void：CREATE OR REPLACE 不能改回傳型別，改了要先 DROP，
-- 而 DROP 會讓這段期間進來的訂單直接失敗。
create or replace function atomic_restore_stock(p_variants jsonb)
returns void
language plpgsql
as $$
declare
  v_rec record;
begin
  for v_rec in select target_id, total_qty from resolve_stock_targets(p_variants)
  loop
    update product_variants
       set stock_qty = stock_qty + v_rec.total_qty
     where id = v_rec.target_id;
  end loop;
end;
$$;
