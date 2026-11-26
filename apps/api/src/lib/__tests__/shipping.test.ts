import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockGetSetting } = vi.hoisted(() => ({
  mockGetSetting: vi.fn(),
}))

vi.mock("../settings", () => ({
  getSetting: mockGetSetting,
}))

import { computeShipping, feeForSubtotal, getShippingRule } from "../shipping"

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
   * 2026-11-26：7-11 取貨與取貨付款都滿 999 免運、全家與宅配滿 1500。
   *
   * 門檻跟著「哪一家超商」走而不是付款方式，所以全家的取貨與取貨付款共用同一
   * 個數字。鎖住它的理由很具體：兩家的 shipping_method 不同、但付款方式相同，
   * 只要有人照著舊的 cvs_cod 分支去算，全家就會在 7-11 的門檻就免運，每筆少收 80。
   */
  it("全家用自己的免運門檻，7-11 不受影響", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_cvs") return "80"
      if (key === "shipping.fee_cvs_cod") return "80"
      if (key === "shipping.free_threshold_cvs") return "999"
      if (key === "shipping.free_threshold_cvs_cod") return "999"
      if (key === "shipping.free_threshold_cvs_family") return "1500"
      // 這個測試只管「兩家超商的門檻分開」，把 7-11 的階梯關掉（門檻 0 = 沒有
      // 這一階），免得 40 元那一段混進來，看不出分家的對錯。
      if (key === "shipping.step_threshold_cvs_711") return "0"
      return null
    })

    await expect(getShippingRule("cvs_711")).resolves.toEqual({ fee: 80, free_threshold: 999 })
    await expect(getShippingRule("cvs_family")).resolves.toEqual({ fee: 80, free_threshold: 1500 })

    // 取貨付款也一樣分家：7-11 照 cvs_cod 的門檻，全家照自己的。
    await expect(getShippingRule("cvs_711", "cvs_cod")).resolves.toEqual({ fee: 80, free_threshold: 999 })
    await expect(getShippingRule("cvs_family", "cvs_cod")).resolves.toEqual({ fee: 80, free_threshold: 1500 })

    // 1000 元這一筆：7-11 免運，全家仍然要收 80 —— 這就是兩家分開的全部重點。
    await expect(computeShipping("cvs_711", 1000)).resolves.toBe(0)
    await expect(computeShipping("cvs_711", 998)).resolves.toBe(80)
    await expect(computeShipping("cvs_family", 1000)).resolves.toBe(80)
    await expect(computeShipping("cvs_family", 1500)).resolves.toBe(0)
    await expect(computeShipping("cvs_family", 1499)).resolves.toBe(80)
    await expect(computeShipping("cvs_family", 1000, "cvs_cod")).resolves.toBe(80)
  })

  it("門檻沒設定時退回現行政策，不會變成「沒有免運」", async () => {
    // Supabase 停權那次 getSetting 全部回 null，7-11 的退路是 "0"（沒有免運），
    // 前台於是顯示成「不提供免運」。退路改成現行門檻，掉線時講的還是對的數字。
    mockGetSetting.mockImplementation(async () => null)
    await expect(getShippingRule("cvs_family")).resolves.toEqual({ fee: 80, free_threshold: 1500 })
    // 7-11 的退路含階梯 —— 滿 699 運費 40 也是現行政策的一部分。
    await expect(getShippingRule("cvs_711")).resolves.toEqual({
      fee: 80,
      free_threshold: 999,
      steps: [{ at: 699, fee: 40 }],
    })
    await expect(getShippingRule("cvs_711", "cvs_cod")).resolves.toEqual({
      fee: 80,
      free_threshold: 999,
      steps: [{ at: 699, fee: 40 }],
    })
    await expect(getShippingRule("home_delivery")).resolves.toEqual({ fee: 150, free_threshold: 1500 })
  })
})

/**
 * 階梯運費（2026-11-26 店主指定）：7-11 取貨滿 699 運費 40、滿 999 免運。
 *
 * 跟免運門檻的關係是「免運先判」—— 階梯只負責還沒到免運門檻的那一段。所以
 * 設在免運門檻之上的階梯永遠輪不到，直接濾掉而不是留著當陷阱。
 */
describe("階梯運費 — 7-11 取貨", () => {
  beforeEach(() => {
    mockGetSetting.mockReset()
  })

  const LADDER = async (key: string) => {
    if (key === "shipping.fee_cvs") return "80"
    if (key === "shipping.fee_cvs_cod") return "80"
    if (key === "shipping.free_threshold_cvs") return "999"
    if (key === "shipping.free_threshold_cvs_cod") return "999"
    if (key === "shipping.free_threshold_cvs_family") return "1500"
    if (key === "shipping.step_threshold_cvs_711") return "699"
    if (key === "shipping.step_fee_cvs_711") return "40"
    return null
  }

  it("★ 三段都要對：未滿 699 收 80、699~998 收 40、999 以上免運", async () => {
    mockGetSetting.mockImplementation(LADDER)
    await expect(computeShipping("cvs_711", 0)).resolves.toBe(80)
    await expect(computeShipping("cvs_711", 698)).resolves.toBe(80)
    await expect(computeShipping("cvs_711", 699)).resolves.toBe(40)
    await expect(computeShipping("cvs_711", 998)).resolves.toBe(40)
    await expect(computeShipping("cvs_711", 999)).resolves.toBe(0)
    await expect(computeShipping("cvs_711", 5000)).resolves.toBe(0)
  })

  it("規則要把階梯帶出來 —— /config 靠它把這段告訴前台", async () => {
    mockGetSetting.mockImplementation(LADDER)
    await expect(getShippingRule("cvs_711")).resolves.toEqual({
      fee: 80,
      free_threshold: 999,
      steps: [{ at: 699, fee: 40 }],
    })
  })

  // 階梯預設是開的（設定讀不到時走程式內的退路，跟免運門檻 999 同一個理由），
  // 所以「不要階梯」得明確關掉：門檻設 0。後台只要把那一格改成 0 就回到單一運費。
  it("門檻設 0 = 關掉階梯，回到單一運費", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_cvs") return "80"
      if (key === "shipping.free_threshold_cvs") return "999"
      if (key === "shipping.step_threshold_cvs_711") return "0"
      return null
    })
    await expect(getShippingRule("cvs_711")).resolves.toEqual({
      fee: 80,
      free_threshold: 999,
    })
    await expect(computeShipping("cvs_711", 700)).resolves.toBe(80)
    await expect(computeShipping("cvs_711", 999)).resolves.toBe(0)
  })

  /**
   * 階梯是「7-11」的，不是「7-11 取貨」的 —— 店主 2026-11-26 指定取貨付款的
   * 運費也是 40。所以 cvs_711 的兩種付款方式都吃階梯，全家與宅配都不吃。
   */
  it("★ 階梯給 7-11 的兩種付款方式 —— 取貨與取貨付款都是 40", async () => {
    mockGetSetting.mockImplementation(LADDER)
    await expect(computeShipping("cvs_711", 700)).resolves.toBe(40)
    await expect(computeShipping("cvs_711", 700, "cvs_cod")).resolves.toBe(40)
    // 取貨付款的三段也要完整：未滿 699 收 80、999 以上免運
    await expect(computeShipping("cvs_711", 698, "cvs_cod")).resolves.toBe(80)
    await expect(computeShipping("cvs_711", 999, "cvs_cod")).resolves.toBe(0)
  })

  it("階梯不給全家、也不給宅配", async () => {
    mockGetSetting.mockImplementation(LADDER)
    await expect(computeShipping("cvs_family", 700)).resolves.toBe(80)
    await expect(computeShipping("cvs_family", 700, "cvs_cod")).resolves.toBe(80)
    // 這組 mock 沒設 fee_home_delivery，宅配走退路 150（不是 80）——
    // 重點仍然是「沒有 40 元那一階」。
    await expect(computeShipping("home_delivery", 700)).resolves.toBe(150)
  })

  it("取貨付款的規則也要把階梯帶出來", async () => {
    mockGetSetting.mockImplementation(LADDER)
    await expect(getShippingRule("cvs_711", "cvs_cod")).resolves.toEqual({
      fee: 80,
      free_threshold: 999,
      steps: [{ at: 699, fee: 40 }],
    })
  })

  it("階梯門檻 >= 免運門檻時濾掉 —— 永遠輪不到，留著只會誤導後台", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_cvs") return "80"
      if (key === "shipping.free_threshold_cvs") return "999"
      if (key === "shipping.step_threshold_cvs_711") return "1099"
      if (key === "shipping.step_fee_cvs_711") return "40"
      return null
    })
    const rule = await getShippingRule("cvs_711")
    expect(rule.steps).toBeUndefined()
    await expect(computeShipping("cvs_711", 1050)).resolves.toBe(0)
  })

  it("階梯運費不低於原運費時濾掉 —— 買更多不能變更貴", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_cvs") return "80"
      if (key === "shipping.free_threshold_cvs") return "999"
      if (key === "shipping.step_threshold_cvs_711") return "699"
      if (key === "shipping.step_fee_cvs_711") return "120"
      return null
    })
    const rule = await getShippingRule("cvs_711")
    expect(rule.steps).toBeUndefined()
    await expect(computeShipping("cvs_711", 700)).resolves.toBe(80)
  })

  it("免運門檻關掉（0）時階梯照算 —— 那是兩件事", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_cvs") return "80"
      if (key === "shipping.free_threshold_cvs") return "0"
      if (key === "shipping.step_threshold_cvs_711") return "699"
      if (key === "shipping.step_fee_cvs_711") return "40"
      return null
    })
    await expect(computeShipping("cvs_711", 698)).resolves.toBe(80)
    await expect(computeShipping("cvs_711", 699)).resolves.toBe(40)
    await expect(computeShipping("cvs_711", 99999)).resolves.toBe(40)
  })

  it("設定讀不到時用程式內的退路 —— 699/40 跟現行政策一致", async () => {
    mockGetSetting.mockResolvedValue(null)
    await expect(getShippingRule("cvs_711")).resolves.toEqual({
      fee: 80,
      free_threshold: 999,
      steps: [{ at: 699, fee: 40 }],
    })
    await expect(computeShipping("cvs_711", 699)).resolves.toBe(40)
  })
})

/**
 * feeForSubtotal：由「規則 + 金額」算出運費的唯一一份邏輯。
 *
 * 加階梯時發現 POST /orders/preview 自己抄了一份舊判斷（免運門檻比一次、否則
 * 收 rule.fee），沒有看 steps。結果 800 元的 7-11 取貨在結帳頁顯示 NT$80、
 * 實際下單收 NT$40 —— 顯示與實收不一致，正是這個專案被咬過好幾次的那種 bug。
 *
 * 所以這段邏輯只能有一份：computeShipping 與 preview 都呼叫它。
 */
describe("feeForSubtotal", () => {
  const RULE = { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }] }

  it("★ 三段都對", () => {
    expect(feeForSubtotal(RULE, 0)).toBe(80)
    expect(feeForSubtotal(RULE, 698)).toBe(80)
    expect(feeForSubtotal(RULE, 699)).toBe(40)
    expect(feeForSubtotal(RULE, 998)).toBe(40)
    expect(feeForSubtotal(RULE, 999)).toBe(0)
  })

  it("沒有階梯時就是「免運門檻以上免運，否則收原運費」", () => {
    const plain = { fee: 80, free_threshold: 1500 }
    expect(feeForSubtotal(plain, 1499)).toBe(80)
    expect(feeForSubtotal(plain, 1500)).toBe(0)
  })

  it("免運門檻 0（不提供免運）時階梯照算", () => {
    expect(feeForSubtotal({ fee: 80, free_threshold: 0, steps: [{ at: 699, fee: 40 }] }, 99999)).toBe(40)
  })

  it("多階取「達到的最高那一階」—— 也就是最便宜的", () => {
    const two = { fee: 80, free_threshold: 1500, steps: [{ at: 699, fee: 40 }, { at: 999, fee: 20 }] }
    expect(feeForSubtotal(two, 700)).toBe(40)
    expect(feeForSubtotal(two, 1000)).toBe(20)
  })

  it("★ computeShipping 與 feeForSubtotal 不能有第二套答案", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_cvs") return "80"
      if (key === "shipping.free_threshold_cvs") return "999"
      if (key === "shipping.step_threshold_cvs_711") return "699"
      if (key === "shipping.step_fee_cvs_711") return "40"
      return null
    })
    const rule = await getShippingRule("cvs_711")
    for (const amount of [0, 698, 699, 800, 998, 999, 5000]) {
      await expect(computeShipping("cvs_711", amount)).resolves.toBe(
        feeForSubtotal(rule, amount),
      )
    }
  })
})

/**
 * 運費本身的退路也要是現行政策。
 *
 * 一般分支（宅配 / 7-11 取貨）共用一行 `?? "80"`，但 SETTING_DEFAULTS 的宅配
 * 運費是 150。平常看不出來（資料庫有值），只有設定讀不到的時候會掉到 80
 * —— 跟免運門檻那個「退路寫成 0 等於宣告沒有免運」是同一類問題，而且方向是
 * 少收客人 70 元。
 */
describe("運費的退路", () => {
  beforeEach(() => {
    mockGetSetting.mockReset()
  })

  it("★ 設定讀不到時，宅配 150、超商 80 —— 跟 SETTING_DEFAULTS 一致", async () => {
    mockGetSetting.mockResolvedValue(null)
    await expect(getShippingRule("home_delivery")).resolves.toEqual({
      fee: 150,
      free_threshold: 1500,
    })
    const cvs = await getShippingRule("cvs_711")
    expect(cvs.fee).toBe(80)
    const family = await getShippingRule("cvs_family")
    expect(family.fee).toBe(80)
    const cod = await getShippingRule("cvs_711", "cvs_cod")
    expect(cod.fee).toBe(80)
  })

  it("有設定時照設定走，退路不介入", async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "shipping.fee_home_delivery") return "120"
      return null
    })
    const home = await getShippingRule("home_delivery")
    expect(home.fee).toBe(120)
  })
})
