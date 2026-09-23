import { describe, expect, it } from "vitest"
import { marqueeSpendMessage, spendProgress, spendTiers } from "../spend-threshold"

const TIERS = [
  { minAmount: 5400, discount: 400 },
  { minAmount: 3600, discount: 200 },
]
const GIFTS = [{ minOrder: 2400, giftName: "誠真生活禮袋．帆布環保袋 (大)" }]

describe("marqueeSpendMessage", () => {
  it("折扣與贈品混在同一條階梯，由低到高", () => {
    expect(marqueeSpendMessage(TIERS, GIFTS)).toBe(
      "滿2400送帆布環保袋 (大)、滿3600折200、滿5400折400",
    )
  })
  it("只有折扣時照舊", () => {
    expect(marqueeSpendMessage(TIERS)).toBe("滿3600折200、滿5400折400")
  })
  it("沒有活動時不出現這句", () => {
    expect(marqueeSpendMessage([], [])).toBeNull()
  })
  it("★ 贈品名稱去掉「誠真生活禮袋．」前綴", () => {
    expect(spendTiers([], GIFTS)[0].reward).toBe("送 帆布環保袋 (大)")
  })
})

describe("spendProgress", () => {
  it("一格都沒到：下一格是最低門檻（贈品）", () => {
    const p = spendProgress(800, TIERS, GIFTS)!
    expect(p.current).toBeNull()
    expect(p.next?.minAmount).toBe(2400)
    expect(p.next?.reward).toBe("送 帆布環保袋 (大)")
    expect(p.remaining).toBe(1600)
  })
  it("剛好達到門檻就算達到", () => {
    const p = spendProgress(2400, TIERS, GIFTS)!
    expect(p.current?.minAmount).toBe(2400)
    expect(p.next?.minAmount).toBe(3600)
    expect(p.remaining).toBe(1200)
  })
  it("★ 只講達到的那一格，不加總", () => {
    const p = spendProgress(3700, TIERS, GIFTS)!
    expect(p.current?.reward).toBe("折 200")
    expect(p.next?.reward).toBe("折 400")
    expect(p.remaining).toBe(1700)
  })
  it("已是最高一格：沒有下一格", () => {
    const p = spendProgress(6000, TIERS, GIFTS)!
    expect(p.current?.minAmount).toBe(5400)
    expect(p.next).toBeNull()
    expect(p.pct).toBe(100)
  })
  it("沒有活動時回 null（購物車不顯示提示）", () => {
    expect(spendProgress(1500, [], [])).toBeNull()
  })
})
