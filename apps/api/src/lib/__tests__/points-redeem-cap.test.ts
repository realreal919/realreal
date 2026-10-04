/**
 * 點數折抵的單筆上限。
 *
 * 上限原本是訂單金額的 100%，等於沒有上限 —— 回饋金累積多的客人可以整筆用點數
 * 付掉，那筆訂單就只剩成本沒有收入。2026-10-04 店主改成 20%。
 */
import { describe, it, expect } from "vitest"
import { calcPointsDiscount, type CartForPoints } from "../points"

const cart = (subtotal: number, shipping = 0): CartForPoints => ({
  subtotal,
  shipping,
  sale_item_total: 0,
  total: subtotal + shipping,
})
const settings = { ratio: 1 }

describe("calcPointsDiscount — 單筆上限 20%", () => {
  it("★ 1,000 元的訂單最多折 200 點", () => {
    const r = calcPointsDiscount(cart(1000), 200, settings)
    expect(r.allowed).toBe(true)
    if (r.allowed) expect(r.discount).toBe(200)
  })

  it("★ 超過 20% 就擋下來，並告訴客人上限是多少", () => {
    const r = calcPointsDiscount(cart(1000), 201, settings)
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.reason).toBe("最多 200 點")
  })

  it("上限無條件捨去，不會多給一點", () => {
    // 999 × 20% = 199.8 → 199
    expect(calcPointsDiscount(cart(999), 199, settings).allowed).toBe(true)
    expect(calcPointsDiscount(cart(999), 200, settings).allowed).toBe(false)
  })

  it("運費不列入計算（APPLY_TO_SHIPPING = false）", () => {
    // 小計 1,000、運費 150：上限仍以 1,000 計，201 點要被擋
    expect(calcPointsDiscount(cart(1000, 150), 201, settings).allowed).toBe(false)
  })

  it("沒輸入點數時不算折抵", () => {
    expect(calcPointsDiscount(cart(1000), 0, settings).allowed).toBe(false)
  })
})
