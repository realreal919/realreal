/**
 * 組合規格的可售數量，由單品庫存換算。
 *
 * 背景：每個 product_variant 原本各有一個獨立的 stock_qty，賣出「草莓 5入組」
 * 只扣 5入組自己的計數器，不會動到「草莓 單袋」。兩個數字從不同步 ——
 * 2026-10-08 盤點時單袋只剩 20 袋，5入組卻顯示 100（等於還能賣 500 袋）。
 *
 * 現在組合規格改成持有「配方」而不是庫存：
 *     attributes.pack_of = { variant_id: "<單品規格>", qty: N }
 * 扣庫存在資料庫端（migration 0056 的 resolve_stock_targets）展開成單品；
 * 這支負責讓「前台看到的數字」跟那個規則一致，否則客人會加得進購物車、
 * 卻在結帳被擋。
 */

export type PackOf = { variant_id: string; qty: number }

export type StockVariantRow = {
  id: string
  stock_qty: number | string | null
  attributes?: Record<string, unknown> | null
}

export function readPackOf(attributes: Record<string, unknown> | null | undefined): PackOf | null {
  const raw = attributes?.pack_of
  if (!raw || typeof raw !== "object") return null
  const { variant_id, qty } = raw as Record<string, unknown>
  const n = Number(qty)
  if (typeof variant_id !== "string" || !variant_id) return null
  if (!Number.isFinite(n) || n <= 0) return null
  return { variant_id, qty: n }
}

/**
 * 把一組規格的 stock_qty 換算成實際可售數量。
 *
 * 單品規格照原值；組合規格 = floor(單品庫存 / 每組數量)。找不到對應的單品時
 * 保留原值 —— 配方填錯不該讓商品整個變成缺貨，那會把能賣的東西下架。
 */
export function withDerivedStock<T extends StockVariantRow>(variants: T[]): T[] {
  const stockById = new Map<string, number>()
  for (const v of variants) stockById.set(v.id, Number(v.stock_qty) || 0)

  return variants.map((v) => {
    const pack = readPackOf(v.attributes)
    if (!pack) return v
    const unitStock = stockById.get(pack.variant_id)
    if (unitStock === undefined) return v
    return { ...v, stock_qty: Math.floor(unitStock / pack.qty) }
  })
}
