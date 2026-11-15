import { describe, it, expect } from "vitest"
import {
  blocksFirstPurchase,
  FIRST_PURCHASE_IN_FLIGHT_GATEWAYS,
  type FirstPurchaseGuardRow,
} from "../campaigns-evaluator"

const row = (o: Partial<FirstPurchaseGuardRow>): FirstPurchaseGuardRow => ({
  status: "pending",
  payment_status: "pending",
  payment_method: "cvs_cod",
  first_purchase_applied: false,
  ...o,
})

describe("blocksFirstPurchase", () => {
  it("已出貨／處理中／已完成的訂單都算買過了", () => {
    for (const status of ["processing", "shipped", "completed"]) {
      expect(blocksFirstPurchase(row({ status }))).toBe(true)
    }
  })

  it("已付款就算用掉首購，即使還沒出貨", () => {
    expect(blocksFirstPurchase(row({ payment_status: "paid" }))).toBe(true)
  })

  it("失敗或取消的訂單從來不算", () => {
    expect(blocksFirstPurchase(row({ status: "failed", first_purchase_applied: true }))).toBe(false)
    expect(blocksFirstPurchase(row({ status: "cancelled", first_purchase_applied: true }))).toBe(false)
  })

  it("沒領到首購折的待付款訂單本來就不擋", () => {
    expect(blocksFirstPurchase(row({ first_purchase_applied: false }))).toBe(false)
  })

  /**
   * 這就是 #10000473 → #10000474：信用卡開了付款頁沒付完，一分鐘後改用貨到付款
   * 重下一筆。前一筆要 15 分鐘後才被支付連判逾時，期間不該鎖著客人的 50 元。
   */
  it.each([...FIRST_PURCHASE_IN_FLIGHT_GATEWAYS])(
    "%s 還在等付款時要讓位給重下的那筆",
    (gateway) => {
      expect(
        blocksFirstPurchase(
          row({
            status: "pending",
            payment_status: "pending",
            payment_method: gateway,
            first_purchase_applied: true,
          }),
        ),
      ).toBe(false)
    },
  )

  /**
   * 貨到付款的 payment_status 一路 pending 到取貨，但訂單是成立的。放行的話
   * 同一個人可以連開好幾筆貨到付款，每筆都折 50。
   */
  it("貨到付款的待出貨訂單仍然擋住", () => {
    expect(
      blocksFirstPurchase(
        row({ payment_method: "cvs_cod", first_purchase_applied: true }),
      ),
    ).toBe(true)
  })

  it("沒列進名單的付款方式照舊擋住（含 payment_method 是 null 的舊資料）", () => {
    expect(blocksFirstPurchase(row({ payment_method: null, first_purchase_applied: true }))).toBe(true)
    expect(
      blocksFirstPurchase(row({ payment_method: "some_new_gateway", first_purchase_applied: true })),
    ).toBe(true)
  })

  /** 線上金流但已經付掉了 —— 不是「等付款」，要擋。 */
  it("線上金流付款成功後就擋住", () => {
    expect(
      blocksFirstPurchase(
        row({ payment_method: "linepay", payment_status: "paid", first_purchase_applied: true }),
      ),
    ).toBe(true)
  })
})
