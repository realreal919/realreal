/**
 * 每張訂單的單一規格購買上限（「限購」）。
 *
 * 補貨量很少的時候，店主要的是「讓多一點人買到」而不是「一個人掃光」。
 * 2026-11-27 草莓 50 克隨身包只補到 6 包，限購 2 包就是這個用途。
 *
 * 跟「停售」同一套做法：寫在 product_variants.attributes 裡，因為後台的規格
 * 編輯器本來就把 attributes 顯示成「欄位：值」—— 店主自己加得了、改得了、
 * 刪得掉，補貨之後不必為了拿掉限購再發一次版。
 *
 *   { "限購": 2 }   → 這個規格每張訂單最多 2 個
 *   沒有這個欄位    → 不限
 *
 * **這是每張訂單的上限，不是每個人一輩子的上限。** 同一個人分兩張訂單還是
 * 買得到 4 包。要做到真正的「每人限購」得比對歷史訂單，而訪客結帳連身分都
 * 沒有，攔不住；寫成訂單上限至少是講得清楚、擋得住的那一種。
 */

export const LIMIT_ATTR_KEY = "限購"

type WithAttributes = { attributes?: Record<string, unknown> | null }

/**
 * 讀出這個規格的訂單上限。回 null ＝不限。
 *
 * 0 或負數一律當作「沒設定」。要停賣有「停售」可以用，所以這裡的 0 幾乎
 * 一定是打錯的 —— 讓一個打錯的數字把整個商品變成買不了，比不限更糟。
 */
export function parsePurchaseLimit(v: WithAttributes): number | null {
  const raw = v.attributes?.[LIMIT_ATTR_KEY]
  if (raw === null || raw === undefined) return null
  const n = Number(String(raw).trim())
  if (!Number.isFinite(n)) return null
  const limit = Math.floor(n)
  return limit > 0 ? limit : null
}

/** 把 purchase_limit 掛到規格上，讓前台不必自己再解析一次 attributes。 */
export function withPurchaseLimit<T extends WithAttributes>(
  variants: T[],
): Array<T & { purchase_limit: number | null }> {
  return variants.map((v) => ({ ...v, purchase_limit: parsePurchaseLimit(v) }))
}

export type LimitBreach = { variantId: string; name: string; qty: number; limit: number }

/**
 * 給客人看的那句話。
 *
 * 要連商品名一起講 —— 規格名常常只是「單包」「7入組」，購物車裡有好幾樣
 * 東西的時候，光看「『單包』限購 2 件」根本不知道要改哪一行。
 */
export function limitBreachMessage(b: LimitBreach): string {
  return `「${b.name}」每張訂單限購 ${b.limit} 件，請調整數量後再結帳`
}

/**
 * 找出超過上限的品項。傳進來的必須是**已經依規格合併過**的購物車 ——
 * 同一個規格拆成兩行送出來的話，逐行檢查每一行都過，合計卻超過。
 */
export function findLimitBreaches<
  T extends WithAttributes & { name?: string | null; products?: { name?: string | null } | null },
>(
  mergedItems: Array<{ variantId: string; qty: number }>,
  variantMap: Map<string, T>,
): LimitBreach[] {
  const out: LimitBreach[] = []
  for (const item of mergedItems) {
    const v = variantMap.get(item.variantId)
    if (!v) continue
    const limit = parsePurchaseLimit(v)
    if (limit !== null && item.qty > limit) {
      out.push({ variantId: item.variantId, name: displayName(v), qty: item.qty, limit })
    }
  }
  return out
}

/** 「商品名・規格名」。只有其中一個就用那一個，兩個都沒有就回空字串。 */
function displayName(v: { name?: string | null; products?: { name?: string | null } | null }): string {
  const product = (v.products?.name ?? "").trim()
  const variant = (v.name ?? "").trim()
  if (product && variant) return `${product}・${variant}`
  return product || variant
}
