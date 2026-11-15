/**
 * 重新付款前，把「已經被別筆訂單拿走的首購折」加回去。
 *
 * 背景：2026-11-14 起，還在等付款的線上金流訂單不再鎖住客人的首購資格
 * （見 campaigns-evaluator 的 blocksFirstPurchase）。客人放棄付款、重下一筆時，
 * 首購折會讓給新的那筆。但舊那筆的總額仍然是折過的，而且在它被判定失敗之前
 * 都還付得掉 —— 支付連約 15 分鐘，LINE Pay／街口要等 expire-unpaid-orders
 * 滿 24 小時才取消，中間第 6 小時我們還會寄一封帶「立即完成付款」的提醒信。
 * 不處理的話，兩筆訂單都會折到 50 元。
 *
 * 判斷依據是「applied_campaign_ids 裡有首購活動，但 first_purchase_applied
 * 已經是 false」—— 這個組合只會出現在旗標被讓出去之後。單看旗標是 false 不夠，
 * 因為從來沒吃過首購折的訂單也是 false。
 *
 * 只加不減：永遠不會加回超過當初實際折掉的金額（首購折會被小計夾住，
 * 見 evalFirstPurchase 的 Math.min），所以取三個數字裡最小的那個。
 */

export type RepayOrderRow = {
  subtotal: number | null
  total: number | null
  discount_amount: number | null
  campaign_discount: number | null
  applied_campaign_ids: string[] | null
  first_purchase_applied: boolean | null
}

export type RepayAdjustment = {
  /** 加回去的金額 */
  removedAmount: number
  total: number
  discountAmount: number
  campaignDiscount: number
  appliedCampaignIds: string[]
}

export function stripReleasedFirstPurchase(
  o: RepayOrderRow,
  firstPurchaseCampaignIds: readonly string[],
  configuredDiscount: number,
): RepayAdjustment | null {
  // 旗標還在這筆身上 = 首購折仍然屬於它，金額不動。
  if (o.first_purchase_applied) return null

  const applied = o.applied_campaign_ids ?? []
  const hit = applied.find((id) => firstPurchaseCampaignIds.includes(id))
  if (!hit) return null // 這筆本來就沒吃到首購折

  const discountAmount = o.discount_amount ?? 0
  const campaignDiscount = o.campaign_discount ?? 0
  const removed = Math.min(configuredDiscount, campaignDiscount, discountAmount)
  if (!(removed > 0)) return null

  return {
    removedAmount: removed,
    total: (o.total ?? 0) + removed,
    discountAmount: discountAmount - removed,
    campaignDiscount: campaignDiscount - removed,
    appliedCampaignIds: applied.filter((id) => id !== hit),
  }
}
