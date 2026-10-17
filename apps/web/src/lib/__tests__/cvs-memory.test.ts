import { describe, expect, it } from "vitest"

/**
 * 「記住上次取貨門市」的決策規則。
 *
 * 實際的 state 流程在 checkout/page.tsx 的 effect 裡，這裡把判斷條件抽出來
 * 單獨驗 —— 會出錯的從來不是 setState，是「什麼時候該套、什麼時候不該套」。
 */
export function shouldApplyRememberedStore(args: {
  addressType: string
  currentStoreId: string
  remembered: { storeId: string } | null
}): boolean {
  if (!args.remembered) return false
  if (args.addressType !== "cvs" && args.addressType !== "cvs_cod") return false
  if (args.currentStoreId) return false
  return true
}

const remembered = { storeId: "230702" }

describe("記住上次取貨門市", () => {
  it("★ 選超商取貨、還沒挑門市 → 帶入", () => {
    expect(shouldApplyRememberedStore({ addressType: "cvs", currentStoreId: "", remembered })).toBe(true)
  })

  it("★ 取貨付款也算超商取貨", () => {
    expect(shouldApplyRememberedStore({ addressType: "cvs_cod", currentStoreId: "", remembered })).toBe(true)
  })

  it("★ 客人已經自己挑過門市 → 不覆蓋", () => {
    expect(shouldApplyRememberedStore({ addressType: "cvs", currentStoreId: "999999", remembered })).toBe(false)
  })

  it("★ 宅配、港澳不帶門市 —— 否則門市會混進宅配訂單", () => {
    expect(shouldApplyRememberedStore({ addressType: "home", currentStoreId: "", remembered })).toBe(false)
    expect(shouldApplyRememberedStore({ addressType: "overseas", currentStoreId: "", remembered })).toBe(false)
  })

  it("沒有歷史訂單的新客人 → 什麼都不做", () => {
    expect(shouldApplyRememberedStore({ addressType: "cvs", currentStoreId: "", remembered: null })).toBe(false)
  })
})
