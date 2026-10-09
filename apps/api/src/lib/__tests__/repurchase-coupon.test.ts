/**
 * 會員券。
 *
 * 信裡白紙黑字寫了「折 100、滿 1500、優惠碼 XXX、期限 X 月 X 日」，這四件事
 * 只要有一件跟程式算的不一樣，客人就會照著信上的條件湊單，然後折不下去。
 */
import { describe, it, expect } from "vitest"
import {
  applyMemberCoupon,
  cartSubtotal,
  dueAfterShip,
  generateCouponCode,
  hasAnyItem,
  normalizeCouponCode,
} from "../repurchase-coupon"

const future = () => new Date(Date.now() + 30 * 86_400_000).toISOString()

const coupon = {
  id: "c1",
  type: "repurchase",
  amount: 100,
  min_order: 1500,
  valid_until: future(),
  status: "active",
  code: "REAB23CD",
}

describe("applyMemberCoupon", () => {
  it("滿門檻就折 100", () => {
    const r = applyMemberCoupon({ coupon, items: [{ line_total: 1500, qty: 1 }] })
    expect(r).toEqual({ applicable: true, couponId: "c1", discount: 100 })
  })

  it("剛好等於門檻算達到", () => {
    expect(
      applyMemberCoupon({ coupon, items: [{ line_total: 1500, qty: 1 }] }).applicable,
    ).toBe(true)
  })

  it("★ 沒到門檻要講還差多少 —— 只說「不符合條件」的話客人只能自己試", () => {
    const r = applyMemberCoupon({ coupon, items: [{ line_total: 1400, qty: 1 }] })
    expect(r).toMatchObject({ applicable: false })
    if (!r.applicable) expect(r.reason).toContain("1500")
  })

  it("★ 不再限夾鏈袋 —— 信上只寫金額門檻，加了品項限制就是我們自己造的客訴", () => {
    const r = applyMemberCoupon({
      coupon,
      items: [{ product_slug: "measuring-spoon", line_total: 1600, qty: 8 }],
    })
    expect(r).toMatchObject({ applicable: true, discount: 100 })
  })

  it("過期不能用", () => {
    const expired = { ...coupon, valid_until: new Date(Date.now() - 1000).toISOString() }
    expect(
      applyMemberCoupon({ coupon: expired, items: [{ line_total: 2000, qty: 1 }] }),
    ).toMatchObject({ applicable: false })
  })

  it("已使用、已作廢都不能用", () => {
    for (const status of ["used", "expired", "revoked"]) {
      expect(
        applyMemberCoupon({ coupon: { ...coupon, status }, items: [{ line_total: 2000, qty: 1 }] }),
      ).toMatchObject({ applicable: false })
    }
  })

  it("★ 折抵不超過小計 —— 不能折到負的去吃掉運費", () => {
    const noMin = { ...coupon, min_order: 0 }
    const r = applyMemberCoupon({ coupon: noMin, items: [{ line_total: 60, qty: 1 }] })
    expect(r).toMatchObject({ applicable: true, discount: 60 })
  })

  it("沒有券就不折", () => {
    expect(applyMemberCoupon({ coupon: null, items: [{ line_total: 2000, qty: 1 }] })).toMatchObject(
      { applicable: false },
    )
  })
})

describe("dueAfterShip", () => {
  it("回饋信第 14 天、回購提醒第 30 天", () => {
    const shipped = "2026-10-01T00:00:00Z"
    expect(dueAfterShip(shipped, 14)?.toISOString().slice(0, 10)).toBe("2026-10-15")
    expect(dueAfterShip(shipped, 30)?.toISOString().slice(0, 10)).toBe("2026-10-31")
  })
  it("★ 沒有出貨日就不寄 —— 寧可不寄，也不要用今天當基準亂算", () => {
    expect(dueAfterShip(null, 14)).toBeNull()
    expect(dueAfterShip("not a date", 14)).toBeNull()
  })
})

describe("normalizeCouponCode", () => {
  it("抄錯格式也要認得", () => {
    expect(normalizeCouponCode("reab23cd")).toBe("REAB23CD")
    expect(normalizeCouponCode(" RE-AB23CD ")).toBe("REAB23CD")
  })
  it("長度或格式不對就當沒輸入", () => {
    expect(normalizeCouponCode("RE123")).toBeNull()
    expect(normalizeCouponCode("REAB23CDE")).toBeNull()
    expect(normalizeCouponCode("")).toBeNull()
    expect(normalizeCouponCode(null)).toBeNull()
  })
})

describe("generateCouponCode", () => {
  it("RE + 6 碼", () => {
    expect(generateCouponCode()).toMatch(/^RE[0-9A-Z]{6}$/)
  })
  it("★ 不含 0/O/1/I/L —— 這組碼會出現在信裡被抄來抄去", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCouponCode().slice(2)).not.toMatch(/[01OIL]/)
    }
  })
  it("產出的碼一定通得過自己的正規化", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateCouponCode()
      expect(normalizeCouponCode(c)).toBe(c)
    }
  })
})

describe("cartSubtotal / hasAnyItem", () => {
  it("小計是各列相加", () => {
    expect(cartSubtotal([{ line_total: 450, qty: 1 }, { line_total: 75, qty: 2 }])).toBe(525)
  })
  it("空單不寄信", () => {
    expect(hasAnyItem([])).toBe(false)
    expect(hasAnyItem([{ line_total: 0, qty: 0 }])).toBe(false)
    expect(hasAnyItem([{ line_total: 450, qty: 1 }])).toBe(true)
  })
})
