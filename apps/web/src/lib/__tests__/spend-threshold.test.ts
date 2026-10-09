import { describe, expect, it } from "vitest"
import { buyGetMessages, firstPurchaseMessage, firstPurchaseProductMessage, marqueeSpendMessage, spendProgress, spendTiers } from "../spend-threshold"

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

  it("★ 贈品要講口味 —— 滿額贈設的就是指定口味的那個變體", () => {
    expect(spendTiers([], [{ minOrder: 1400, giftName: "銀杏水蜜桃 – 50克隨身包" }])[0].reward).toBe(
      "送 銀杏水蜜桃 50克隨身包",
    )
    expect(spendTiers([], [{ minOrder: 3800, giftName: "銀杏水蜜桃 – 300克夾鏈袋" }])[0].short).toBe(
      "送銀杏水蜜桃 300克夾鏈袋",
    )
  })

  it("★ 送兩份以上要講數量，單位看品名（夾鏈袋論袋、其餘論包）", () => {
    const sachet = spendTiers([], [{ minOrder: 1800, giftName: "初心原味 – 50克隨身包", qty: 2 }])[0]
    expect(sachet.short).toBe("送初心原味 50克隨身包2包")
    expect(sachet.reward).toBe("送 初心原味 50克隨身包2包")
    expect(spendTiers([], [{ minOrder: 3600, giftName: "初心原味 – 300克夾鏈袋", qty: 3 }])[0].short).toBe(
      "送初心原味 300克夾鏈袋3袋",
    )
  })

  it("只送一份時不寫數量", () => {
    expect(spendTiers([], [{ minOrder: 1800, giftName: "初心原味 – 50克隨身包", qty: 1 }])[0].short).toBe(
      "送初心原味 50克隨身包",
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
  it("跑馬燈只講一句短的，門檻留給商品頁講", () => {
    expect(firstPurchaseMessage({ discount: 50, minOrder: 300 })).toBe("會員首購折50元")
    expect(firstPurchaseMessage({ discount: 50, minOrder: 0 })).toBe("會員首購折50元")
  })
  it("金額跟著後台設定走，不寫死", () => {
    expect(firstPurchaseMessage({ discount: 80, minOrder: 300 })).toBe("會員首購折80元")
  })
  it("沒有活動或折扣為 0 時不顯示", () => {
    expect(firstPurchaseMessage(null)).toBeNull()
    expect(firstPurchaseMessage({ discount: 0, minOrder: 300 })).toBeNull()
  })
})

describe("firstPurchaseProductMessage", () => {
  it("商品本身就過門檻：不多講條件", () => {
    expect(firstPurchaseProductMessage({ discount: 50, minOrder: 300 }, 1650)).toBe(
      "加入會員，首次購買結帳自動折 50元",
    )
  })
  it("★ 買一件也達不到門檻的商品要講門檻，不然結帳才發現折不了", () => {
    expect(firstPurchaseProductMessage({ discount: 50, minOrder: 300 }, 75)).toBe(
      "加入會員，首次購買滿 300元結帳自動折 50元",
    )
  })
  it("剛好等於門檻算達到", () => {
    expect(firstPurchaseProductMessage({ discount: 50, minOrder: 300 }, 300)).toBe(
      "加入會員，首次購買結帳自動折 50元",
    )
  })
  it("★ 不知道商品價格時一律講門檻（寧可多講條件，不要承諾折不了的錢）", () => {
    expect(firstPurchaseProductMessage({ discount: 50, minOrder: 300 })).toBe(
      "加入會員，首次購買滿 300元結帳自動折 50元",
    )
  })
  it("沒門檻時不提", () => {
    expect(firstPurchaseProductMessage({ discount: 50, minOrder: 0 }, 75)).toBe(
      "加入會員，首次購買結帳自動折 50元",
    )
  })
  it("沒有活動或折扣為 0 時不顯示", () => {
    expect(firstPurchaseProductMessage(null, 1650)).toBeNull()
    expect(firstPurchaseProductMessage({ discount: 0, minOrder: 300 }, 1650)).toBeNull()
  })
  it("夾鏈袋頁一併講送量匙", () => {
    expect(firstPurchaseProductMessage({ discount: 50, minOrder: 300 }, 1650, true)).toBe(
      "加入會員，首次購買結帳自動折 50元，並送不鏽鋼量匙 1支",
    )
  })
  it("★ 沒傳旗標就不講量匙 —— 隨身包不送勺，講了就是承諾不會發生的事", () => {
    expect(firstPurchaseProductMessage({ discount: 50, minOrder: 300 }, 75)).toBe(
      "加入會員，首次購買滿 300元結帳自動折 50元",
    )
  })
  it("達不到折扣門檻的夾鏈袋：兩個條件都要講清楚", () => {
    expect(firstPurchaseProductMessage({ discount: 50, minOrder: 300 }, 75, true)).toBe(
      "加入會員，首次購買滿 300元結帳自動折 50元，並送不鏽鋼量匙 1支",
    )
  })
})
