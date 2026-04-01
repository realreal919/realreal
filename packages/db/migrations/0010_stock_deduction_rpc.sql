-- Atomically deduct stock from a product variant.
-- Returns TRUE if deduction succeeded, FALSE if insufficient stock.
CREATE OR REPLACE FUNCTION deduct_variant_stock(p_variant_id UUID, p_qty INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  rows_affected INT;
BEGIN
  UPDATE product_variants
  SET stock_qty = stock_qty - p_qty
  WHERE id = p_variant_id
    AND stock_qty >= p_qty;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;

-- Restore stock for a product variant (used during order rollback).
CREATE OR REPLACE FUNCTION restore_variant_stock(p_variant_id UUID, p_qty INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE product_variants
  SET stock_qty = stock_qty + p_qty
  WHERE id = p_variant_id;
END;
$$;
