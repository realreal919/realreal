import { describe, it, expect } from "vitest"
import { stripReleasedFirstPurchase, type RepayOrderRow } from "../repay-adjust"

const FP = ["camp-first-purchase"]
const row = (o: Partial<RepayOrderRow> = {}): RepayOrderRow => ({
  subtotal: 1340,
  total: 1290,
  discount_amount: 50,
  campaign_discount: 50,
  applied_campaign_ids: [...FP],
  first_purchase_applied: false,
  ...o,
})

describe("stripReleasedFirstPurchase", () => {
  /** #10000473 的狀態：吃過首購折，但旗標已經讓給 #10000474。 */
  it("旗標被讓走時，把 50 元加回總額", () => {
    expect(stripReleasedFirstPurchase(row(), FP, 50)).toEqual({
      removedAmount: 50,
      total: 1340,
      discountAmount: 0,
      campaignDiscount: 0,
      appliedCampaignIds: [],
    })
  })

  it("旗標還在就不動金額", () => {
    expect(stripReleasedFirstPurchase(row({ first_purchase_applied: true }), FP, 50)).toBeNull()
  })

  it("本來就沒吃首購折的訂單不受影響", () => {
    expect(
      stripReleasedFirstPurchase(
        row({ applied_campaign_ids: ["camp-spend-threshold"], discount_amount: 100, campaign_discount: 100 }),
        FP,
        50,
      ),
    ).toBeNull()
  })

  it("沒有套過任何活動也不受影響", () => {
    expect(
      stripReleasedFirstPurchase(
        row({ applied_campaign_ids: [], discount_amount: 0, campaign_discount: 0, total: 1340 }),
        FP,
        50,
      ),
    ).toBeNull()
  })

  /** 其他活動的折扣要原封不動留著，只拿掉首購那一份。 */
  it("同時有別的活動折扣時只拿掉首購那一份", () => {
    const r = row({
      subtotal: 2000,
      discount_amount: 250, // 首購 50 + 滿額折 200
      campaign_discount: 250,
      applied_campaign_ids: ["camp-spend-threshold", ...FP],
      total: 1750,
    })
    expect(stripReleasedFirstPurchase(r, FP, 50)).toEqual({
      removedAmount: 50,
      total: 1800,
      discountAmount: 200,
      campaignDiscount: 200,
      appliedCampaignIds: ["camp-spend-threshold"],
    })
  })

  /** 首購折會被小計夾住（evalFirstPurchase 的 Math.min），加回來不能超過當初折掉的。 */
  it("當初只折到比設定值少時，只加回實際折掉的金額", () => {
    const r = row({ subtotal: 30, discount_amount: 30, campaign_discount: 30, total: 0 })
    expect(stripReleasedFirstPurchase(r, FP, 50)).toEqual({
      removedAmount: 30,
      total: 30,
      discountAmount: 0,
      campaignDiscount: 0,
      appliedCampaignIds: [],
    })
  })

  it("金額欄位是 null 的舊資料不會爆、也不會亂加錢", () => {
    expect(
      stripReleasedFirstPurchase(
        row({ discount_amount: null, campaign_discount: null }),
        FP,
        50,
      ),
    ).toBeNull()
  })

  it("沒有設定任何首購活動 id 時不動作", () => {
    expect(stripReleasedFirstPurchase(row(), [], 50)).toBeNull()
  })
})
