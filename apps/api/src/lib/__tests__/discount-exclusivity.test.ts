import { describe, expect, it } from "vitest"
import { resolveFirstPurchaseVsCoupon } from "../discount-exclusivity"

describe("resolveFirstPurchaseVsCoupon", () => {
  it("★ 券比較多 → 用券，首購折作廢（#10000338：首購 50 vs 感謝券 100）", () => {
    expect(resolveFirstPurchaseVsCoupon(5000, 10000)).toEqual({
      dropFirstPurchase: true,
      dropCoupon: false,
    })
  })

  it("首購折比較多 → 用首購折，券留著", () => {
    expect(resolveFirstPurchaseVsCoupon(10000, 5000)).toEqual({
      dropFirstPurchase: false,
      dropCoupon: true,
    })
  })

  it("★ 平手留首購折，券留著下次用（首購折 50 vs 滿600折50 很常見）", () => {
    expect(resolveFirstPurchaseVsCoupon(5000, 5000)).toEqual({
      dropFirstPurchase: false,
      dropCoupon: true,
    })
  })

  it("★ 沒有券的人，首購折照常給（不能因為券是 0 就作廢首購）", () => {
    expect(resolveFirstPurchaseVsCoupon(5000, 0)).toEqual({
      dropFirstPurchase: false,
      dropCoupon: false,
    })
  })

  it("★ 不是首購的人，券照常用", () => {
    expect(resolveFirstPurchaseVsCoupon(0, 10000)).toEqual({
      dropFirstPurchase: false,
      dropCoupon: false,
    })
  })

  it("兩邊都沒有時什麼都不動", () => {
    expect(resolveFirstPurchaseVsCoupon(0, 0)).toEqual({
      dropFirstPurchase: false,
      dropCoupon: false,
    })
  })

  it("負數當成沒有（不該發生，但不能讓它反過來作廢另一邊）", () => {
    expect(resolveFirstPurchaseVsCoupon(-100, 5000)).toEqual({
      dropFirstPurchase: false,
      dropCoupon: false,
    })
    expect(resolveFirstPurchaseVsCoupon(5000, -100)).toEqual({
      dropFirstPurchase: false,
      dropCoupon: false,
    })
  })

  it("★ 永遠不會兩邊都作廢", () => {
    const cases = [[5000, 10000], [10000, 5000], [5000, 5000], [1, 2], [0, 0], [5000, 0]]
    for (const [fp, cp] of cases) {
      const d = resolveFirstPurchaseVsCoupon(fp, cp)
      expect(d.dropFirstPurchase && d.dropCoupon).toBe(false)
    }
  })

  it("★ 留下來的一定是比較大的那個金額", () => {
    for (const [fp, cp] of [[5000, 10000], [10000, 5000], [5000, 5000], [300, 7000]]) {
      const d = resolveFirstPurchaseVsCoupon(fp, cp)
      const kept = (d.dropFirstPurchase ? 0 : fp) + (d.dropCoupon ? 0 : cp)
      expect(kept).toBe(Math.max(fp, cp))
    }
  })
})
