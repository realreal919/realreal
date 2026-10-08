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

/**
 * 混搭組合的配方。
 *
 *   fixed —— 固定要出的口味（「原味．可可．草莓 各1袋」就是三筆 qty 1）。
 *   pool  —— 客人結帳後才決定口味的部分（「任選5袋（不含銀杏）」）。
 *
 * 可售數量 = 所有 fixed 的 floor(庫存 / 每組用量) 與 pool 的
 * floor(池內庫存總和 / 每組用量) 取最小值。
 *
 * pool 會高估：客人可能五袋全選草莓。但它的用途是取代「名目 100」那個
 * 完全脫離現實的數字 —— 真正的對帳還是靠定期盤點扣掉未出貨訂單（那時候
 * 口味已經從備註確定了）。寧可估得不夠準，也不要顯示一個明知是假的數字。
 */
export type Recipe = {
  fixed?: Array<{ variant_id: string; qty: number }>
  pool?: { variant_ids: string[]; qty: number }
}

export type StockVariantRow = {
  id: string
  stock_qty: number | string | null
  attributes?: Record<string, unknown> | null
}

export function readRecipe(attributes: Record<string, unknown> | null | undefined): Recipe | null {
  const raw = attributes?.recipe
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const fixed: Array<{ variant_id: string; qty: number }> = []
  if (Array.isArray(r.fixed)) {
    for (const item of r.fixed) {
      if (!item || typeof item !== "object") continue
      const { variant_id, qty } = item as Record<string, unknown>
      const n = Number(qty)
      if (typeof variant_id === "string" && variant_id && Number.isFinite(n) && n > 0) {
        fixed.push({ variant_id, qty: n })
      }
    }
  }
  let pool: Recipe["pool"]
  if (r.pool && typeof r.pool === "object") {
    const { variant_ids, qty } = r.pool as Record<string, unknown>
    const n = Number(qty)
    if (Array.isArray(variant_ids) && variant_ids.length > 0 && Number.isFinite(n) && n > 0) {
      pool = { variant_ids: variant_ids.filter((x): x is string => typeof x === "string"), qty: n }
    }
  }
  if (fixed.length === 0 && !pool) return null
  return { ...(fixed.length ? { fixed } : {}), ...(pool ? { pool } : {}) }
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
export function withDerivedStock<T extends StockVariantRow>(
  variants: T[],
  /** 配方指向其他商品的規格時，從這裡查它們的庫存。 */
  externalStock?: Map<string, number>,
): T[] {
  const stockById = new Map<string, number>(externalStock ?? [])
  for (const v of variants) stockById.set(v.id, Number(v.stock_qty) || 0)

  return variants.map((v) => {
    const pack = readPackOf(v.attributes)
    if (pack) {
      const unitStock = stockById.get(pack.variant_id)
      if (unitStock === undefined) return v
      return { ...v, stock_qty: Math.floor(unitStock / pack.qty) }
    }

    const recipe = readRecipe(v.attributes)
    if (!recipe) return v

    const limits: number[] = []
    for (const f of recipe.fixed ?? []) {
      const stock = stockById.get(f.variant_id)
      // 查不到就跳過這一項，不要讓整組變成 0 —— 配方填錯不該把能賣的東西下架。
      if (stock === undefined) continue
      limits.push(Math.floor(stock / f.qty))
    }
    if (recipe.pool) {
      const known = recipe.pool.variant_ids
        .map((id) => stockById.get(id))
        .filter((n): n is number => n !== undefined)
      if (known.length > 0) {
        limits.push(Math.floor(known.reduce((a, b) => a + b, 0) / recipe.pool.qty))
      }
    }
    if (limits.length === 0) return v
    return { ...v, stock_qty: Math.max(0, Math.min(...limits)) }
  })
}

/** 配方裡提到的所有規格 id（用來一次把外部庫存查回來）。 */
export function referencedVariantIds(variants: StockVariantRow[]): string[] {
  const ids = new Set<string>()
  for (const v of variants) {
    const pack = readPackOf(v.attributes)
    if (pack) ids.add(pack.variant_id)
    const recipe = readRecipe(v.attributes)
    for (const f of recipe?.fixed ?? []) ids.add(f.variant_id)
    for (const id of recipe?.pool?.variant_ids ?? []) ids.add(id)
  }
  return [...ids]
}
