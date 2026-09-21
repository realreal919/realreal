import { describe, expect, it } from "vitest"
import { marqueeSpendMessage, spendProgress } from "../spend-threshold"

const TIERS = [
  { minAmount: 5000, discount: 600 },
  { minAmount: 1100, discount: 100 },
  { minAmount: 2000, discount: 200 },
]

describe("marqueeSpendMessage", () => {
  it("依門檻由小到大列出全部檔次", () => {
    expect(marqueeSpendMessage(TIERS)).toBe("滿1100折100、滿2000折200、滿5000折600")
  })
  it("沒有活動時不出現這句", () => {
    expect(marqueeSpendMessage([])).toBeNull()
  })
})

describe("spendProgress", () => {
  it("一檔都沒到：下一檔是最低門檻", () => {
    expect(spendProgress(800, TIERS)).toEqual({
      current: null, next: { minAmount: 1100, discount: 100 }, remaining: 300, pct: 73,
    })
  })
  it("剛好達到門檻就算達到", () => {
    const p = spendProgress(1100, TIERS)!
    expect(p.current).toEqual({ minAmount: 1100, discount: 100 })
    expect(p.next).toEqual({ minAmount: 2000, discount: 200 })
    expect(p.remaining).toBe(900)
  })
  it("★ 只算達到的最高一檔，不加總", () => {
    const p = spendProgress(2300, TIERS)!
    expect(p.current).toEqual({ minAmount: 2000, discount: 200 })
    expect(p.next).toEqual({ minAmount: 5000, discount: 600 })
    expect(p.remaining).toBe(2700)
  })
  it("已是最高檔：沒有下一檔", () => {
    expect(spendProgress(6000, TIERS)).toEqual({
      current: { minAmount: 5000, discount: 600 }, next: null, remaining: 0, pct: 100,
    })
  })
  it("沒有活動時回 null（購物車不顯示提示）", () => {
    expect(spendProgress(1500, [])).toBeNull()
  })
})
