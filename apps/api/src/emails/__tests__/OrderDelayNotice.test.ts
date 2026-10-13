import { describe, expect, it } from "vitest"
import { ORDER_DELAY_SUBJECT, renderOrderDelayNotice } from "../OrderDelayNotice"

const DATA = { customerName: "鄭婉淇", orderNumber: "10000327", shipDate: "10/15（四）" }

describe("renderOrderDelayNotice", () => {
  it("姓名、訂單編號、出貨日期都印出來", () => {
    const html = renderOrderDelayNotice(DATA)
    expect(html).toContain("鄭婉淇 您好，")
    expect(html).toContain("10000327")
    expect(html).toContain("10/15（四）")
  })

  it("★ 出貨日期照著印，程式不自己算星期幾", () => {
    const html = renderOrderDelayNotice({ ...DATA, shipDate: "11/3（二）" })
    expect(html).toContain("11/3（二）")
    expect(html).not.toContain("10/15")
  })

  it("沒有姓名時用「您好」，不會印出空白的名字", () => {
    const html = renderOrderDelayNotice({ ...DATA, customerName: "" })
    expect(html).toContain("<p>您好，</p>")
    expect(html).not.toContain(" 您好，</p>")
  })

  it("★ 文案關鍵句與店主核可的版本一致", () => {
    const html = renderOrderDelayNotice(DATA)
    for (const phrase of [
      "因為訂單中有品項目前缺貨",
      "需要稍長一些的備貨時間",
      "出貨後會寄送出貨通知信到您的信箱",
      "讓您多等了幾天，不好意思",
      "如果有需要調整訂單內容",
      "謝謝您的耐心",
      "讓身心輕盈，讓生活誠真",
    ]) {
      expect(html).toContain(phrase)
    }
  })

  it("LINE 客服帳號要在信裡", () => {
    expect(renderOrderDelayNotice(DATA)).toContain("@900kevgi")
  })

  it("★ 不承諾送達日期，只講出貨日", () => {
    const html = renderOrderDelayNotice(DATA)
    expect(html).not.toContain("送達")
    expect(html).not.toContain("到貨")
  })

  it("主旨固定", () => {
    expect(ORDER_DELAY_SUBJECT).toBe("您的訂單出貨時間說明｜誠真生活")
  })
})
