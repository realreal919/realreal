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

/**
 * 不該在商品頁宣傳「滿額好禮」的商品 id。
 *
 * 傳入的是每一個**對外宣傳中**的滿額檔次各自的排除清單。只有被**每一個**檔次都
 * 排除的商品才算 —— 只被其中一檔排除的商品還是拿得到其他檔次的好禮，隱藏那行字
 * 會讓客人以為完全沒有。
 *
 * 為什麼要有這個：商品頁的滿額好禮那一塊原本是「只要有檔次就印」，所以 1111
 * 限時組合（已排除在三檔之外）跟湯匙（不列入門檻）的頁面也印著「滿1500送…」，
 * 那是一句做不到的承諾 —— 買 3,600 元的限時組合什麼都拿不到。
 *
 * 沒有任何宣傳中的檔次時回空陣列：那塊本來就不會出現，不需要排除誰。
 */
export function unadvertisableProductIds(tierExclusions: string[][]): string[] {
  if (tierExclusions.length === 0) return []
  const [first, ...rest] = tierExclusions
  return [...new Set(first)].filter((id) => rest.every((ex) => ex.includes(id)))
}
