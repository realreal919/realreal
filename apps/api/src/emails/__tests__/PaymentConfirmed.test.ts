import { describe, expect, it } from "vitest"
import { renderPaymentConfirmed } from "../PaymentConfirmed"

const baseData = {
  orderNumber: "RR20260830001",
  amount: "500",
  customerName: "王小明",
  items: [{ name: "初心原味", qty: 1, price: "67" }],
  pickupInfo: "宅配｜台北市",
}

describe("renderPaymentConfirmed — membership CTA", () => {
  it("omits the CTA when isGuestOrder is not set (member order)", () => {
    const html = renderPaymentConfirmed(baseData)
    expect(html).not.toContain("加入會員")
  })

  it("omits the CTA when isGuestOrder is explicitly false", () => {
    const html = renderPaymentConfirmed({ ...baseData, isGuestOrder: false })
    expect(html).not.toContain("加入會員")
  })

  it("includes the CTA when isGuestOrder is true", () => {
    const html = renderPaymentConfirmed({ ...baseData, isGuestOrder: true })
    expect(html).toContain("加入會員")
    expect(html).toContain("/checkout/confirm?order=RR20260830001")
  })
})

describe("renderPaymentConfirmed — 客人的訂單備註", () => {
  it("沒填備註時整列不出現", () => {
    expect(renderPaymentConfirmed(baseData)).not.toContain("您的備註")
    expect(renderPaymentConfirmed({ ...baseData, notes: "   " })).not.toContain("您的備註")
    expect(renderPaymentConfirmed({ ...baseData, notes: null })).not.toContain("您的備註")
  })

  it("有填就原樣顯示 —— 任選組合的口味全靠這一欄", () => {
    const html = renderPaymentConfirmed({ ...baseData, notes: "草莓2、可可1、火龍果1、芝麻1" })
    expect(html).toContain("您的備註")
    expect(html).toContain("草莓2、可可1、火龍果1、芝麻1")
  })

  it("跳脫 HTML，客人打的角括號不會變成標籤", () => {
    const html = renderPaymentConfirmed({ ...baseData, notes: '<script>alert("x")</script>' })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})
