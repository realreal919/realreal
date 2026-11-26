import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockGetSetting } = vi.hoisted(() => ({
  mockGetSetting: vi.fn(),
}))

vi.mock("../settings", () => ({
  getSetting: mockGetSetting,
}))

import { computeShipping, getShippingRule } from "../shipping"

describe("shipping settings", () => {
  beforeEach(() => {
    mockGetSetting.mockReset()
  })

  it("loads home delivery fee and free-shipping threshold from settings", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_home_delivery") return "180"
      if (key === "shipping.free_threshold_home") return "1200"
      return null
    })

    await expect(getShippingRule("home_delivery")).resolves.toEqual({
      fee: 180,
      free_threshold: 1200,
    })
    await expect(computeShipping("home_delivery", 1199)).resolves.toBe(180)
    await expect(computeShipping("home_delivery", 1200)).resolves.toBe(0)
  })

  it("keeps overseas COD online shipping at zero", async () => {
    await expect(getShippingRule("overseas_cod")).resolves.toEqual({
      fee: 0,
      free_threshold: 0,
    })
    await expect(computeShipping("overseas_cod", 100)).resolves.toBe(0)
  })

  /**
   * 2026-11-26：7-11 滿 899 免運（原本 699）、全家與宅配滿 1500。
   *
   * 門檻跟著「哪一家超商」走而不是付款方式，所以全家的取貨與取貨付款共用同一
   * 個數字。鎖住它的理由很具體：兩家的 shipping_method 不同、但付款方式相同，
   * 只要有人照著舊的 cvs_cod 分支去算，全家就會在 7-11 的門檻就免運，每筆少收 80。
   */
  it("全家用自己的免運門檻，7-11 不受影響", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_cvs") return "80"
      if (key === "shipping.fee_cvs_cod") return "80"
      if (key === "shipping.free_threshold_cvs") return "899"
      if (key === "shipping.free_threshold_cvs_cod") return "899"
      if (key === "shipping.free_threshold_cvs_family") return "1500"
      return null
    })

    await expect(getShippingRule("cvs_711")).resolves.toEqual({ fee: 80, free_threshold: 899 })
    await expect(getShippingRule("cvs_family")).resolves.toEqual({ fee: 80, free_threshold: 1500 })

    // 取貨付款也一樣分家：7-11 照 cvs_cod 的門檻，全家照自己的。
    await expect(getShippingRule("cvs_711", "cvs_cod")).resolves.toEqual({ fee: 80, free_threshold: 899 })
    await expect(getShippingRule("cvs_family", "cvs_cod")).resolves.toEqual({ fee: 80, free_threshold: 1500 })

    // 900 元這一筆：7-11 免運，全家仍然要收 80 —— 這就是兩家分開的全部重點。
    await expect(computeShipping("cvs_711", 900)).resolves.toBe(0)
    await expect(computeShipping("cvs_711", 898)).resolves.toBe(80)
    await expect(computeShipping("cvs_family", 900)).resolves.toBe(80)
    await expect(computeShipping("cvs_family", 1500)).resolves.toBe(0)
    await expect(computeShipping("cvs_family", 1499)).resolves.toBe(80)
    await expect(computeShipping("cvs_family", 900, "cvs_cod")).resolves.toBe(80)
  })

  it("門檻沒設定時退回現行政策，不會變成「沒有免運」", async () => {
    // Supabase 停權那次 getSetting 全部回 null，7-11 的退路是 "0"（沒有免運），
    // 前台於是顯示成「不提供免運」。退路改成現行門檻，掉線時講的還是對的數字。
    mockGetSetting.mockImplementation(async () => null)
    await expect(getShippingRule("cvs_family")).resolves.toEqual({ fee: 80, free_threshold: 1500 })
    await expect(getShippingRule("cvs_711")).resolves.toEqual({ fee: 80, free_threshold: 899 })
    await expect(getShippingRule("home_delivery")).resolves.toEqual({ fee: 80, free_threshold: 1500 })
  })
})
