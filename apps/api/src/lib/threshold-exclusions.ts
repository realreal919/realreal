import { DEFAULT_SCOOP_GIFT_SLUG } from "./scoop-gift"

/**
 * 不列入「滿額」與「免運」門檻金額的商品（2026-11-03 店主指定：湯匙加購品）。
 *
 * 湯匙是 45 元的加購品，不是食品本身。讓它幫客人跨過滿額贈、滿額折、免運門檻，
 * 等於用一支湯匙換一包贈品或一次免運。它照原價收，只是**不計入門檻的分母**。
 *
 * slug 沿用贈勺設定的同一個字串，不要再寫死第二份 —— 兩邊對不上的時候，
 * 送勺的規則與門檻的規則會指向不同商品，而且不會有任何訊息。
 */
export const THRESHOLD_EXCLUDED_SLUGS: readonly string[] = [DEFAULT_SCOOP_GIFT_SLUG]

export function isThresholdExcludedSlug(slug: string | null | undefined): boolean {
  return !!slug && THRESHOLD_EXCLUDED_SLUGS.includes(slug)
}

/**
 * 這些品項在購物車裡的金額（分）—— 從門檻用的小計裡扣掉它。
 *
 * 用 expandedItems（加購價展開後的結果）而不是原始行，因為湯匙正是以加購價
 * 45 元賣的；用原價算會扣多了。
 */
export function excludedThresholdCents(
  items: Array<{ variantId: string; qty: number; unitPriceCents: number }>,
  slugOf: (variantId: string) => string | null | undefined,
): number {
  let cents = 0
  for (const it of items) {
    if (isThresholdExcludedSlug(slugOf(it.variantId))) cents += it.unitPriceCents * it.qty
  }
  return cents
}
