import { supabase } from "./supabase"

/**
 * 預購商品的規格 id。
 *
 * 預購賣的是「現在沒有、等到貨」，所以結帳不扣庫存也不回補 —— 扣了會被
 * atomic_deduct_stock 以 insufficient_stock 擋下來（組合規格會在資料庫端展開成
 * 單品，而那些單品正是缺貨的那幾種），客人根本下不了單。
 *
 * 查不到或查詢失敗時回傳空集合：寧可照現貨規則扣庫存（最糟是下不了單、客人
 * 會來問），也不要因為一次查詢失敗就讓所有商品都不扣庫存而超賣。
 */
export async function preorderVariantIds(variantIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(variantIds.filter(Boolean))]
  if (ids.length === 0) return new Set()
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, products!inner(is_preorder)")
    .in("id", ids)
    .eq("products.is_preorder", true)
  if (error) {
    console.warn("[preorder] 查預購規格失敗，這批照現貨規則處理:", error.message)
    return new Set()
  }
  return new Set(((data ?? []) as Array<{ id: string }>).map((v) => v.id))
}
