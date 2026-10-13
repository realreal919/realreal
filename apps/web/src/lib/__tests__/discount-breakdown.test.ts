import { describe, expect, it } from "vitest"
import { buildDiscountBreakdown } from "../discount-breakdown"

/** #10000338：小計 3,040，首購折 50 ＋ 老朋友感謝券 TKQUHDGS 折 100 */
const ORDER_338 = {
  discount_amount: 150,
  campaign_discount: 50,
  points_used: 0,
  metadata: null,
  campaignNames: ["首購折 NT$50"],
  memberCoupon: { code: "TKQUHDGS", amount: 100 },
}

describe("buildDiscountBreakdown — 會員券", () => {
  it("★ 會員券標成「會員券折扣」，不再是「會員等級折扣」（#10000338）", () => {
    const lines = buildDiscountBreakdown(ORDER_338)
    expect(lines.map((l) => l.key)).toEqual(["campaign", "member_coupon"])
    expect(lines[1]).toEqual({
      key: "member_coupon",
      label: "會員券折扣（TKQUHDGS）",
      amount: 100,
    })
    expect(lines.some((l) => l.label.includes("會員等級"))).toBe(false)
  })

  it("各行加起來等於 discount_amount", () => {
    const lines = buildDiscountBreakdown(ORDER_338)
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(150)
  })

  it("沒有代碼時不印括號", () => {
    const lines = buildDiscountBreakdown({
      discount_amount: 100,
      campaign_discount: 0,
      memberCoupon: { amount: 100 },
    })
    expect(lines[0].label).toBe("會員券折扣")
  })

  it("★ 券面額大於實際折抵時，以實際折掉的為準（各行不能超過總折扣）", () => {
    // 券面額 100，但這張單總共只折了 60
    const lines = buildDiscountBreakdown({
      discount_amount: 60,
      campaign_discount: 0,
      memberCoupon: { code: "TK1", amount: 100 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBe(60)
  })

  it("★ 真的有等級折扣時，兩行分開列", () => {
    // 總折 200 = 活動 50 + 會員券 100 + 等級折扣 50
    const lines = buildDiscountBreakdown({
      discount_amount: 200,
      campaign_discount: 50,
      memberCoupon: { code: "TK1", amount: 100 },
    })
    expect(lines.map((l) => [l.key, l.amount])).toEqual([
      ["campaign", 50],
      ["member_coupon", 100],
      ["member", 50],
    ])
  })

  it("★ 沒有會員券時，剩下的仍然算等級折扣（舊行為不變）", () => {
    const lines = buildDiscountBreakdown({
      discount_amount: 100,
      campaign_discount: 50,
      memberCoupon: null,
    })
    expect(lines.map((l) => [l.key, l.amount])).toEqual([
      ["campaign", 50],
      ["member", 50],
    ])
  })

  it("優惠碼與會員券可以同時出現，各自一行", () => {
    const lines = buildDiscountBreakdown({
      discount_amount: 180,
      campaign_discount: 0,
      metadata: { coupon_code: "ZUMBA100", coupon_discount: 80 },
      memberCoupon: { code: "TK1", amount: 100 },
    })
    expect(lines.map((l) => l.key)).toEqual(["coupon", "member_coupon"])
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(180)
  })

  it("總折扣是 0 時不列任何一行", () => {
    expect(buildDiscountBreakdown({ discount_amount: 0, memberCoupon: { code: "TK1", amount: 100 } })).toEqual([])
  })
})
