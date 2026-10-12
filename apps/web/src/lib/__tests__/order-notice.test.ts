import { describe, expect, it } from "vitest"
import { orderNotice } from "../order-notice"

describe("orderNotice", () => {
  it("超商取貨（線上已付款）講「無須再次付款」", () => {
    const n = orderNotice("cvs_711", "linepay")!
    expect(n.title).toBe("訂單處理與取貨說明")
    expect(n.steps[3]).toContain("無須再次付款")
    expect(n.closing).toContain("感謝您的耐心訂購")
  })

  it("全家跟 7-11 用同一份", () => {
    expect(orderNotice("cvs_family", "jkopay")).toEqual(orderNotice("cvs_711", "linepay"))
  })

  it("超商取貨付款講「向店員支付訂單金額」", () => {
    const n = orderNotice("cvs_711", "cvs_cod")!
    expect(n.title).toBe("訂單處理與取貨付款說明")
    expect(n.steps[3]).toContain("向店員支付訂單金額")
  })

  it("★ 取貨付款就算還沒讀到取貨方式也要有說明（頁面一進來就看得到）", () => {
    expect(orderNotice(null, "cvs_cod")?.title).toBe("訂單處理與取貨付款說明")
  })

  it("宅配講配送到收件地址、無人收件怎麼辦", () => {
    const n = orderNotice("home_delivery", "linepay")!
    expect(n.title).toBe("訂單處理與配送說明")
    expect(n.steps[2]).toContain("收件地址")
    expect(n.steps[3]).toContain("無人收件")
    expect(n.closing).toContain("陪伴您與家人好好生活")
  })

  it("★ 三份文案的出貨天數都是 2–5 個工作天，不講送達天數", () => {
    for (const m of [["cvs_711", "linepay"], ["cvs_711", "cvs_cod"], ["home_delivery", "linepay"]]) {
      const n = orderNotice(m[0], m[1])!
      expect(n.steps[0]).toBe("我們會於 2–5 個工作天內備貨並出貨（不含例假日）。")
      expect(n.steps.join("")).not.toContain("3–5")
    }
  })

  it("★ 港澳沒有對應文案時回 null，不套宅配那份（會漏掉運費到付）", () => {
    expect(orderNotice("overseas_cod", "pchomepay")).toBeNull()
  })

  it("★ 取貨方式還沒載入時回 null，不先顯示可能是錯的那份", () => {
    expect(orderNotice(null, "linepay")).toBeNull()
    expect(orderNotice(undefined, undefined)).toBeNull()
    expect(orderNotice("", "linepay")).toBeNull()
  })

  it("沒見過的取貨方式回 null", () => {
    expect(orderNotice("drone_delivery", "linepay")).toBeNull()
  })

  it("每一份都是 4 個步驟", () => {
    for (const m of [["cvs_711", "linepay"], ["cvs_711", "cvs_cod"], ["home_delivery", "linepay"]]) {
      expect(orderNotice(m[0], m[1])!.steps).toHaveLength(4)
    }
  })
})
