import { describe, expect, it } from "vitest"
import { findLimitBreaches, parsePurchaseLimit, withPurchaseLimit } from "../purchase-limit"

describe("parsePurchaseLimit", () => {
  it("讀得出數字，也讀得出後台打成字串的數字", () => {
    expect(parsePurchaseLimit({ attributes: { 限購: 2 } })).toBe(2)
    expect(parsePurchaseLimit({ attributes: { 限購: "2" } })).toBe(2)
    expect(parsePurchaseLimit({ attributes: { 限購: " 3 " } })).toBe(3)
  })

  it("沒設定就是不限", () => {
    expect(parsePurchaseLimit({ attributes: {} })).toBeNull()
    expect(parsePurchaseLimit({ attributes: null })).toBeNull()
    expect(parsePurchaseLimit({})).toBeNull()
  })

  it("0、負數、看不懂的字一律當作沒設定", () => {
    // 要停賣有「停售」可以用。這裡填 0 幾乎一定是打錯的，而讓一個打錯的
    // 數字把整個商品變成買不了，比不限更糟。
    expect(parsePurchaseLimit({ attributes: { 限購: 0 } })).toBeNull()
    expect(parsePurchaseLimit({ attributes: { 限購: -1 } })).toBeNull()
    expect(parsePurchaseLimit({ attributes: { 限購: "兩包" } })).toBeNull()
    expect(parsePurchaseLimit({ attributes: { 限購: "" } })).toBeNull()
  })

  it("小數無條件捨去 —— 2.9 包還是只能買 2 包", () => {
    expect(parsePurchaseLimit({ attributes: { 限購: 2.9 } })).toBe(2)
  })

  it("不會動到別的 attributes（停售、pack_of）", () => {
    expect(parsePurchaseLimit({ attributes: { 停售: "是", pack_of: { qty: 5 } } })).toBeNull()
  })
})

describe("withPurchaseLimit", () => {
  it("每個規格都掛上 purchase_limit，原本的欄位不動", () => {
    const out = withPurchaseLimit([
      { id: "a", name: "單包", attributes: { 限購: 2 } },
      { id: "b", name: "7入組", attributes: {} },
    ])
    expect(out).toEqual([
      { id: "a", name: "單包", attributes: { 限購: 2 }, purchase_limit: 2 },
      { id: "b", name: "7入組", attributes: {}, purchase_limit: null },
    ])
  })
})

describe("findLimitBreaches", () => {
  const map = new Map([
    ["v1", { name: "單包", attributes: { 限購: 2 } }],
    ["v2", { name: "7入組", attributes: {} }],
  ])

  it("剛好買到上限放行", () => {
    expect(findLimitBreaches([{ variantId: "v1", qty: 2 }], map)).toEqual([])
  })

  it("超過上限就擋，而且講得出規格名稱與上限", () => {
    expect(findLimitBreaches([{ variantId: "v1", qty: 3 }], map)).toEqual([
      { variantId: "v1", name: "單包", qty: 3, limit: 2 },
    ])
  })

  it("沒設限購的規格不受影響", () => {
    expect(findLimitBreaches([{ variantId: "v2", qty: 50 }], map)).toEqual([])
  })

  it("不認得的規格略過 —— 擋不存在的商品是別的檢查的事", () => {
    expect(findLimitBreaches([{ variantId: "nope", qty: 99 }], map)).toEqual([])
  })

  it("一次回報全部超量的品項，不是只報第一個", () => {
    const m = new Map([
      ["a", { name: "草莓單包", attributes: { 限購: 2 } }],
      ["b", { name: "可可單包", attributes: { 限購: 1 } }],
    ])
    const out = findLimitBreaches([{ variantId: "a", qty: 3 }, { variantId: "b", qty: 2 }], m)
    expect(out.map((x) => x.name)).toEqual(["草莓單包", "可可單包"])
  })
})
