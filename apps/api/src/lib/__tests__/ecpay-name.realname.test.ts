import { describe, expect, it } from "vitest"
import { validateRealName, validateCvsReceiverName } from "../ecpay-name"

const ok = (n: string) => expect(validateRealName(n), n).toBeUndefined()
const no = (n: string) => expect(validateRealName(n), n).toBeTypeOf("string")

describe("validateRealName — 收件人真實姓名", () => {
  it("一般中文名照舊通過", () => {
    ok("王小明"); ok("陳怡君"); ok("李四")
  })

  it("★ 超過 5 個字的中文名要過 —— 原住民族名常常 6~8 字", () => {
    ok("阿將‧伊崮喜瀾")
    ok("阿布娪·卡阿紛吶")
    ok("伊斯坦大‧貝雅夫正男")
  })

  it("★ 中文名中間有空白也要過", () => {
    ok("阿布娪 卡阿紛吶")
    ok("陳 怡君")
  })

  it("★ 英文名含連字號／撇號要過", () => {
    ok("Mary-Jane Chen")
    ok("O'Brien Lee")
    ok("Anne-Marie Wu")
  })

  it("英文全名照舊通過（空格式與連寫式）", () => {
    ok("Xuan Chen"); ok("XuanChen"); ok("Li Wei Chen")
  })

  it("暱稱照樣擋 —— 這條規則的本意", () => {
    no("xuan"); no("a"); no("123"); no(""); no("Ann")  // 單一單字＝暱稱，照樣擋
  })

  it("★ 長度上限：中文超過 15 字擋下（明顯不是姓名）", () => {
    no("一二三四五六七八九十一二三四五六")
  })

  it("超商取貨的綠界限制是另一道，沒有被放寬", () => {
    // 7 字中文在宅配可以，但超商取貨不行（綠界只收 2~5 字）
    ok("阿將‧伊崮喜瀾")
    expect(validateCvsReceiverName("阿將‧伊崮喜瀾")).toBeTypeOf("string")
    expect(validateCvsReceiverName("王小明")).toBeUndefined()
  })
})
