/**
 * 商品標籤（products.badge_text）的底色。
 *
 * 這個欄位是自由文字，店主拿它掛兩種意思完全相反的東西：
 *   促銷——「限時組合」「期間限定」：要搶眼，粉紅 #F4617A。
 *   缺貨——「補貨中」：是提醒，不是賣點。用粉紅會被讀成促銷，客人點進去
 *          才發現買不到幾件，所以改走灰色（跟卡片上停用的「已售完」按鈕同一個
 *          #687279），看起來就是狀態而不是活動。
 *
 * 2026-11-14 可可 300 克只剩 3 袋，標了「補貨中」才發現這件事。
 *
 * 用關鍵字比對而不是整串相等：店主常常把數量寫進去（「補貨中，約 11/20 到貨」），
 * 寫死整串的話下次改字就又變回粉紅，而且沒有人會發現。
 */

/** 促銷標籤的粉紅。 */
export const BADGE_PROMO = "#F4617A"

/** 缺貨／補貨這類狀態標籤的灰。與商品卡停用按鈕同色。 */
export const BADGE_MUTED = "#687279"

/** 看到這些字就當成狀態標籤。 */
const MUTED_KEYWORDS = ["補貨", "缺貨", "售完", "暫停", "停售"] as const

/** 標籤文字 → 底色。空字串或 null 一律回促銷色（呼叫端本來就不會渲染）。 */
export function badgeColor(text: string | null | undefined): string {
  const s = (text ?? "").trim()
  if (!s) return BADGE_PROMO
  return MUTED_KEYWORDS.some((k) => s.includes(k)) ? BADGE_MUTED : BADGE_PROMO
}
