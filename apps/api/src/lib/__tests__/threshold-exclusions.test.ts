/**
 * 湯匙加購品不列入「滿額」與「免運」門檻金額（2026-11-03 店主指定）。
 *
 * 湯匙是 45 元的加購品，不是食品。讓它幫客人跨過滿額贈、滿額折、優惠碼低消或
 * 免運門檻，等於用一支湯匙換一包贈品或一次免運。它照原價收，只是不計入門檻的
 * 分母 —— 所以這裡算的是「要從小計裡扣掉多少」，不是改價。
 */
import { describe, it, expect } from "vitest"
import {
  excludedThresholdCents,
  HIDE_SPEND_GIFT_PROMO_SLUGS,
  isThresholdExcludedSlug,
  THRESHOLD_EXCLUDED_SLUGS,
  unadvertisableProductIds,
} from "../threshold-exclusions"

const SPOON = "spoon-v"
const OAT = "oat-v"
const slugOf = (id: string) =>
  ({ [SPOON]: "measuring-spoon", [OAT]: "vegan-protein-or300" })[id] ?? null

describe("門檻排除清單", () => {
  it("★ 湯匙在清單裡", () => {
    expect(THRESHOLD_EXCLUDED_SLUGS).toContain("measuring-spoon")
    expect(isThresholdExcludedSlug("measuring-spoon")).toBe(true)
  })

  it("其他商品不在清單裡", () => {
    expect(isThresholdExcludedSlug("vegan-protein-or300")).toBe(false)
    expect(isThresholdExcludedSlug(null)).toBe(false)
    expect(isThresholdExcludedSlug(undefined)).toBe(false)
    expect(isThresholdExcludedSlug("")).toBe(false)
  })
})

describe("要從門檻小計扣掉的金額", () => {
  it("★ 用實際收的加購價算，不是原價", () => {
    // 湯匙加購價 45（原價 69）。用原價算會扣多了，客人反而更難達到門檻。
    const cents = excludedThresholdCents(
      [{ variantId: SPOON, qty: 1, unitPriceCents: 4500 }],
      slugOf,
    )
    expect(cents).toBe(4500)
  })

  it("★ 只扣湯匙，其他品項不動", () => {
    const cents = excludedThresholdCents(
      [
        { variantId: OAT, qty: 2, unitPriceCents: 38000 },
        { variantId: SPOON, qty: 1, unitPriceCents: 4500 },
      ],
      slugOf,
    )
    expect(cents).toBe(4500)
  })

  it("買多支湯匙照支數扣", () => {
    const cents = excludedThresholdCents(
      [{ variantId: SPOON, qty: 3, unitPriceCents: 4500 }],
      slugOf,
    )
    expect(cents).toBe(13500)
  })

  it("沒有湯匙時扣 0", () => {
    expect(
      excludedThresholdCents([{ variantId: OAT, qty: 1, unitPriceCents: 38000 }], slugOf),
    ).toBe(0)
    expect(excludedThresholdCents([], slugOf)).toBe(0)
  })

  it("查不到 slug 的品項不扣 —— 不確定就照算，寧可少排除也不要誤扣客人的金額", () => {
    expect(
      excludedThresholdCents([{ variantId: "unknown", qty: 1, unitPriceCents: 10000 }], slugOf),
    ).toBe(0)
  })
})

/**
 * 商品頁的「滿額好禮」那一塊原本只要有檔次就印，所以 1111 限時組合（被三檔都
 * 排除）跟湯匙（不列入門檻）的頁面也印著「滿1500送…」—— 買 3,600 元的限時組合
 * 其實什麼都拿不到，那是一句做不到的承諾。
 */
describe("哪些商品頁不該印滿額好禮", () => {
  const PACK = "pack-1111"
  const OTHER = "other-product"

  it("★ 被每一個檔次都排除 → 不印", () => {
    expect(unadvertisableProductIds([[PACK], [PACK], [PACK]])).toEqual([PACK])
  })

  it("★ 只被其中一檔排除 → 照印，它還拿得到其他檔次的好禮", () => {
    expect(unadvertisableProductIds([[PACK], [], [PACK]])).toEqual([])
  })

  it("沒有任何檔次 → 空的，那一塊本來就不會出現", () => {
    expect(unadvertisableProductIds([])).toEqual([])
  })

  it("有檔次但都沒設排除清單 → 空的", () => {
    expect(unadvertisableProductIds([[], [], []])).toEqual([])
  })

  it("多個商品各自判斷，不會互相影響", () => {
    expect(unadvertisableProductIds([[PACK, OTHER], [PACK]]).sort()).toEqual([PACK])
  })

  it("同一檔重複填同一個 id 不會讓它出現兩次", () => {
    expect(unadvertisableProductIds([[PACK, PACK], [PACK]])).toEqual([PACK])
  })
})

/**
 * 「拿不到」與「拿得到但不在自己頁面上講」是兩件事，只是剛好共用同一個前端開關。
 * 這組測試鎖的是它們不要混在一起 —— 把文案清單接到門檻計算裡，客人就真的少拿贈品。
 */
describe("指定不印滿額好禮的頁面（只影響文案）", () => {
  it("★ 銀杏水蜜桃 50克 在文案清單裡", () => {
    expect(HIDE_SPEND_GIFT_PROMO_SLUGS).toContain("vegan-protein-ginkgo-peach50")
  })

  it("★ 但它不在門檻排除清單裡 —— 它照樣計入滿額門檻", () => {
    expect(THRESHOLD_EXCLUDED_SLUGS).not.toContain("vegan-protein-ginkgo-peach50")
    expect(isThresholdExcludedSlug("vegan-protein-ginkgo-peach50")).toBe(false)
  })

  it("★ 買它的金額不會被扣掉", () => {
    const cents = excludedThresholdCents(
      [{ variantId: "gp", qty: 10, unitPriceCents: 7500 }],
      () => "vegan-protein-ginkgo-peach50",
    )
    expect(cents).toBe(0)
  })

  it("湯匙反過來：兩份清單裡都算不印，但它是真的不計入門檻", () => {
    expect(THRESHOLD_EXCLUDED_SLUGS).toContain("measuring-spoon")
    expect(HIDE_SPEND_GIFT_PROMO_SLUGS).not.toContain("measuring-spoon")
  })
})
