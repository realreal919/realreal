import { describe, it, expect } from "vitest"
import { badgeColor, BADGE_PROMO, BADGE_MUTED } from "../badge-tone"

describe("badgeColor", () => {
  it("促銷標籤維持粉紅", () => {
    expect(badgeColor("限時組合")).toBe(BADGE_PROMO)
    expect(badgeColor("期間限定")).toBe(BADGE_PROMO)
    expect(badgeColor("新品")).toBe(BADGE_PROMO)
  })

  it("補貨中走灰色", () => {
    expect(badgeColor("補貨中")).toBe(BADGE_MUTED)
  })

  /** 店主會把到貨日寫進標籤，寫死整串比對就會漏掉。 */
  it("關鍵字出現在長句裡也算狀態標籤", () => {
    expect(badgeColor("補貨中，約 11/20 到貨")).toBe(BADGE_MUTED)
    expect(badgeColor("缺貨中")).toBe(BADGE_MUTED)
    expect(badgeColor("暫停供應")).toBe(BADGE_MUTED)
  })

  it("前後空白不影響判斷", () => {
    expect(badgeColor("  補貨中 ")).toBe(BADGE_MUTED)
  })

  it("沒有標籤時回預設色，不會丟錯", () => {
    expect(badgeColor(null)).toBe(BADGE_PROMO)
    expect(badgeColor(undefined)).toBe(BADGE_PROMO)
    expect(badgeColor("   ")).toBe(BADGE_PROMO)
  })
})
