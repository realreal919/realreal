export type VariantPricingRow = {
  id: string
  sku: string | null
  name: string
  price: number | string | null
  sale_price: number | string | null
  addon_price: number | string | null
  addon_limit: number | string | null
  product_id: string
  products: { category_id: string | null; name: string | null; slug?: string | null; is_addon: boolean | null; is_active?: boolean | null } | null
  /** 停售旗標在這裡（見 lib/variant-order.ts）。 */
  attributes?: Record<string, unknown> | null
}

export type AddonLinePricing = {
  variantId: string
  qty: number
  addonQty: number        // units charged at the add-on price (0..addon_limit)
  addonUnitCents: number
  normalUnitCents: number
}

export type ExpandedOrderItem = {
  variantId: string
  qty: number
  unitPriceCents: number
}

function normalUnitCents(v: VariantPricingRow): number {
  return Math.round(Number(v.sale_price ?? v.price ?? 0) * 100)
}

/**
 * Coalesce duplicate cart lines by variantId (sum qty), preserving the first
 * line's labels. MUST run before computeAddonPricing so the qty-1 add-on cap
 * can't be bypassed by sending the same variant as two separate lines.
 */
export function mergeItemsByVariant<T extends { variantId: string; qty: number }>(
  items: T[],
): T[] {
  const byVariant = new Map<string, T>()
  for (const it of items) {
    const cur = byVariant.get(it.variantId)
    if (cur) cur.qty += it.qty
    else byVariant.set(it.variantId, { ...it })
  }
  return [...byVariant.values()]
}

/**
 * Cart-aware effective pricing for the 加購價 feature. See feature rules.
 * Pass ALREADY-MERGED items (mergeItemsByVariant) so the qty cap is per-variant.
 */
export function computeAddonPricing(
  items: Array<{ variantId: string; qty: number }>,
  variantMap: Map<string, VariantPricingRow>,
): { lines: AddonLinePricing[]; expandedItems: ExpandedOrderItem[]; subtotalCents: number } {
  const hasNormalItem = items.some((i) => {
    const v = variantMap.get(i.variantId)
    return v != null && v.products?.is_addon !== true && i.qty >= 1
  })

  const lines: AddonLinePricing[] = []
  const expandedItems: ExpandedOrderItem[] = []
  let subtotalCents = 0

  for (const item of items) {
    const v = variantMap.get(item.variantId)
    const normal = v ? normalUnitCents(v) : 0
    const addonRaw = v?.addon_price != null ? Math.round(Number(v.addon_price) * 100) : null
    const isAddonProduct = v?.products?.is_addon === true
    const eligible = hasNormalItem && isAddonProduct && addonRaw != null && addonRaw < normal
    // Per-variant cap: the first `limit` units get the add-on price, the rest
    // fall back to the normal price. Defaults to 1 (legacy behaviour).
    const limit = Math.max(1, Math.floor(Number(v?.addon_limit ?? 1)))

    if (eligible && item.qty >= 1) {
      const addonQty = Math.min(item.qty, limit)
      lines.push({ variantId: item.variantId, qty: item.qty, addonQty, addonUnitCents: addonRaw!, normalUnitCents: normal })
      expandedItems.push({ variantId: item.variantId, qty: addonQty, unitPriceCents: addonRaw! })
      subtotalCents += addonRaw! * addonQty
      const rest = item.qty - addonQty
      if (rest > 0) {
        expandedItems.push({ variantId: item.variantId, qty: rest, unitPriceCents: normal })
        subtotalCents += normal * rest
      }
    } else {
      lines.push({ variantId: item.variantId, qty: item.qty, addonQty: 0, addonUnitCents: 0, normalUnitCents: normal })
      expandedItems.push({ variantId: item.variantId, qty: item.qty, unitPriceCents: normal })
      subtotalCents += normal * item.qty
    }
  }
  return { lines, expandedItems, subtotalCents }
}

/**
 * 把加購價展開後的每一條腿，做成活動計算用的購物車列。
 *
 * 一個規格可能拆成兩列：加購腿（前 addon_limit 件，加購價）與原價腿（其餘）。
 * 不要再壓成「一個規格一列、單價取混合平均」—— 那會讓「買 N 送 1 送最便宜的
 * 一件」看不到真正的最低單價。#10000518（2026-11-25）就是這樣少折了 1 元：
 * 銀杏 4 件是 2×69 + 2×75，壓成平均 72 之後，最便宜的變成別人的 70 元隨身包，
 * 折了 70 而不是 69。
 *
 * 拆開不影響任何「看金額」的活動：同一個規格兩列的 Σ(unit_price × qty) 跟原本
 * 一列完全相等，所以小計、滿額門檻、百分比折扣的結果都不變。而 scope 過濾是
 * 逐列比 variant_id / category_id，兩列帶一樣的欄位，過濾結果也一樣。
 *
 * preview 與 POST 兩邊都要呼叫同一支 —— 這兩段的購物車只要算得不一樣，結帳頁
 * 顯示的金額就會跟實際收的不同。
 */
export function buildEvaluatorCartItems(
  expandedItems: ExpandedOrderItem[],
  mergedItems: Array<{ variantId: string; qty: number; productName?: string | null }>,
  variantMap: Map<string, VariantPricingRow>,
): Array<{
  product_id: string
  variant_id: string
  category_id: string | null
  product_slug?: string | null
  sku: string | null
  name: string
  unit_price: number
  qty: number
}> {
  const nameByVariant = new Map<string, string | null | undefined>()
  for (const m of mergedItems) nameByVariant.set(m.variantId, m.productName)

  return expandedItems.map((e) => {
    const v = variantMap.get(e.variantId)
    return {
      product_id: v?.product_id ?? "",
      variant_id: e.variantId,
      category_id: v?.products?.category_id ?? null,
      product_slug: v?.products?.slug ?? null,
      sku: v?.sku ?? null,
      name: nameByVariant.get(e.variantId) ?? v?.products?.name ?? v?.name ?? "",
      unit_price: e.unitPriceCents / 100,
      qty: e.qty,
    }
  })
}
