/**
 * 計量勺贈品的判斷規則。鎖住的是兩次修訂的結果：
 * 觸發看「有沒有買夾鏈袋」而不是金額，資格看「拿過沒有」而不是「是不是首購」。
 */
import { describe, it, expect } from "vitest"
import { parseSlugList, scoopGiftApplies } from "../scoop-gift"

const TRIGGERS = ["vegan-protein-or300", "protein-5pack"]
const base = {
  enabled: true,
  triggerSlugs: TRIGGERS,
  alreadyReceived: false,
  isMember: true,
}

describe("scoopGiftApplies", () => {
  it("買夾鏈袋、還沒拿過勺 → 送", () => {
    expect(scoopGiftApplies({ ...base, items: [{ product_slug: "protein-5pack", qty: 1 }] })).toBe(true)
  })

  it("★ 只買隨身包不送 —— 單份包裝不需要勺子", () => {
    expect(
      scoopGiftApplies({ ...base, items: [{ product_slug: "vegan-protein-powder-original", qty: 10 }] }),
    ).toBe(false)
  })

  it("★ 拿過的人不再送，即使又買了夾鏈袋", () => {
    expect(
      scoopGiftApplies({ ...base, alreadyReceived: true, items: [{ product_slug: "protein-5pack", qty: 1 }] }),
    ).toBe(false)
  })

  it("★ 不是第一張訂單也要送 —— 舊會員沒拿過的，回購時補送", () => {
    // 這裡沒有任何「第幾張訂單」的輸入，正是重點：資格只看 alreadyReceived。
    expect(scoopGiftApplies({ ...base, items: [{ product_slug: "vegan-protein-or300", qty: 1 }] })).toBe(true)
  })

  it("★ 訪客不送 —— 沒有帳號可以記，每次結帳都會再送一支", () => {
    expect(
      scoopGiftApplies({ ...base, isMember: false, items: [{ product_slug: "protein-5pack", qty: 1 }] }),
    ).toBe(false)
  })

  it("關掉開關就不送", () => {
    expect(
      scoopGiftApplies({ ...base, enabled: false, items: [{ product_slug: "protein-5pack", qty: 1 }] }),
    ).toBe(false)
  })

  it("★ 設定是空的時候不送，不要變成全站都送", () => {
    expect(
      scoopGiftApplies({ ...base, triggerSlugs: [], items: [{ product_slug: "protein-5pack", qty: 1 }] }),
    ).toBe(false)
  })

  it("數量 0 的品項不算", () => {
    expect(scoopGiftApplies({ ...base, items: [{ product_slug: "protein-5pack", qty: 0 }] })).toBe(false)
  })

  it("認不出 slug 的品項（來路不明的購物車列）不算", () => {
    expect(scoopGiftApplies({ ...base, items: [{ product_slug: null, qty: 1 }] })).toBe(false)
  })
})

describe("parseSlugList", () => {
  it("逗號與換行都能分隔，去掉空白", () => {
    expect(parseSlugList(" a, b\nc ,, ")).toEqual(["a", "b", "c"])
  })
  it("空值回空陣列", () => {
    expect(parseSlugList(null)).toEqual([])
    expect(parseSlugList("")).toEqual([])
  })
})
