import { describe, expect, it } from "vitest"
import { buyGetMessages, firstPurchaseMessage, marqueeSpendMessage, spendProgress, spendTiers } from "../spend-threshold"

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

  it("★ 不講贈品口味：破折號前面的口味要拿掉", () => {
    expect(spendTiers([], [{ minOrder: 1800, giftName: "初心原味 – 50克隨身包" }])[0].reward).toBe("送 50克隨身包")
    expect(spendTiers([], [{ minOrder: 3600, giftName: "初心原味 – 300克夾鏈袋" }])[0].short).toBe("送300克夾鏈袋")
  })

  it("★ 送兩份以上要講數量，單位看品名（夾鏈袋論袋、其餘論包）", () => {
    const sachet = spendTiers([], [{ minOrder: 1800, giftName: "初心原味 – 50克隨身包", qty: 2 }])[0]
    expect(sachet.short).toBe("送50克隨身包2包")
    expect(sachet.reward).toBe("送 50克隨身包2包")
    expect(spendTiers([], [{ minOrder: 3600, giftName: "初心原味 – 300克夾鏈袋", qty: 3 }])[0].short).toBe(
      "送300克夾鏈袋3袋",
    )
  })

  it("只送一份時不寫數量", () => {
    expect(spendTiers([], [{ minOrder: 1800, giftName: "初心原味 – 50克隨身包", qty: 1 }])[0].short).toBe(
      "送50克隨身包",
    )
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

describe("buyGetMessages", () => {
  it("買 X 送 Y 講成一句話", () => {
    expect(buyGetMessages([{ label: "300克夾鏈袋", buyQty: 10, getQty: 1 }])).toEqual(["300克夾鏈袋買10送1"])
  })
  it("沒有活動時回空陣列（跑馬燈不多出一格）", () => {
    expect(buyGetMessages([])).toEqual([])
    expect(buyGetMessages()).toEqual([])
  })
  it("★ 缺名稱或數量的活動不出現，不會變成「買0送0」", () => {
    expect(buyGetMessages([{ label: "", buyQty: 10, getQty: 1 }, { label: "夾鏈袋", buyQty: 0, getQty: 1 }])).toEqual([])
  })
})

describe("firstPurchaseMessage", () => {
  it("★ 有門檻時要講出來，不然客人結帳才發現用不了", () => {
    expect(firstPurchaseMessage({ discount: 50, minOrder: 300 })).toBe("加入會員首購滿300元折50元")
  })
  it("沒門檻時不提，免得以為還有條件", () => {
    expect(firstPurchaseMessage({ discount: 50, minOrder: 0 })).toBe("加入會員立即享首購折50元")
  })
  it("沒有活動或折扣為 0 時不顯示", () => {
    expect(firstPurchaseMessage(null)).toBeNull()
    expect(firstPurchaseMessage({ discount: 0, minOrder: 300 })).toBeNull()
  })
})
