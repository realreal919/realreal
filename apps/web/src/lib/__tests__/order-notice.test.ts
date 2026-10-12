import { describe, expect, it } from "vitest"
import { orderNotice } from "../order-notice"

/** 四種取貨方式各一組 [取貨方式, 付款方式] */
const ALL = [
  ["cvs_711", "linepay"],
  ["cvs_711", "cvs_cod"],
  ["home_delivery", "linepay"],
  ["overseas_cod", "pchomepay"],
]

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

  it("★ 四份文案的出貨天數都是 2–5 個工作天，不講送達天數", () => {
    for (const m of ALL) {
      const n = orderNotice(m[0], m[1])!
      expect(n.steps[0]).toBe("我們會於 2–5 個工作天內備貨並出貨（不含例假日）。")
      expect(n.steps[1]).toContain("出貨通知信")
      expect(n.steps.join("")).not.toContain("3–5")
    }
  })

  it("港澳走順豐，講運費到付與關稅", () => {
    const n = orderNotice("overseas_cod", "pchomepay")!
    expect(n.title).toBe("港澳配送｜順豐速運")
    expect(n.steps).toHaveLength(5)
    expect(n.steps[3]).toContain("到付")
    expect(n.steps[4]).toContain("關稅")
  })

  it("★ 港澳那兩句不能漏：收件人要付運費、可能有關稅", () => {
    const joined = orderNotice("overseas_cod", "pchomepay")!.steps.join("")
    expect(joined).toContain("由收件人依順豐速運的實際收費支付")
    expect(joined).toContain("跨境配送可能涉及關稅")
  })

  it("★ 另外三份都沒有到付／關稅那兩句，不能互相套用", () => {
    for (const m of [["cvs_711", "linepay"], ["cvs_711", "cvs_cod"], ["home_delivery", "linepay"]]) {
      const joined = orderNotice(m[0], m[1])!.steps.join("")
      expect(joined).not.toContain("到付")
      expect(joined).not.toContain("關稅")
    }
  })

  it("★ 取貨方式還沒載入時回 null，不先顯示可能是錯的那份", () => {
    expect(orderNotice(null, "linepay")).toBeNull()
    expect(orderNotice(undefined, undefined)).toBeNull()
    expect(orderNotice("", "linepay")).toBeNull()
  })

  it("沒見過的取貨方式回 null", () => {
    expect(orderNotice("drone_delivery", "linepay")).toBeNull()
  })

  it("超商與宅配各 4 步，港澳 5 步（多了到付與關稅）", () => {
    expect(orderNotice("cvs_711", "linepay")!.steps).toHaveLength(4)
    expect(orderNotice("cvs_711", "cvs_cod")!.steps).toHaveLength(4)
    expect(orderNotice("home_delivery", "linepay")!.steps).toHaveLength(4)
    expect(orderNotice("overseas_cod", "pchomepay")!.steps).toHaveLength(5)
  })

  it("★ 四份的結語都不是空的（結語漏掉不會報錯，只會少一段）", () => {
    for (const m of ALL) {
      expect(orderNotice(m[0], m[1])!.closing.length).toBeGreaterThan(10)
    }
  })
})
