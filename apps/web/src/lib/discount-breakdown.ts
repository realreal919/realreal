/**
 * Turn an order row's stored discount fields into labeled display lines so
 * admins (and customers) can see WHY a discount applied, not just the total.
 *
 * Data sources (all already persisted at order creation, orders.ts):
 *   campaign_discount      — 行銷活動折扣金額
 *   metadata.coupon_*      — 優惠券代碼 + 折抵金額（客人自己輸入的優惠碼）
 *   points_used            — 點數折抵（1 點 = NT$1）
 *   memberCoupon           — 會員券（感謝券、回購券）；訂單上沒有這個欄位，
 *                            由呼叫端用 member_coupons.used_order_id 反查
 *   discount_amount        — 總折扣；扣掉上面四項的餘額才是會員等級折扣
 *
 * 2026-10-13：會員券原本沒有自己的一行，於是它的金額掉進「扣剩的」那個桶子，
 * 被標成「會員等級折扣」。#10000338 就是這樣：客人是初心之友（折扣率 0），
 * 畫面卻顯示「會員等級折扣 100」，實際上那是老朋友感謝券 TKQUHDGS。
 *
 * 用反查而不是在訂單上多存一個欄位，是為了連既有訂單一起修好 —— member_coupons
 * 本來就記著 used_order_id，不必改資料也不必回填。
 */

export type DiscountLine = {
  key: "campaign" | "coupon" | "member_coupon" | "points" | "member" | "other"
  label: string
  amount: number
}

export type DiscountBreakdownInput = {
  discount_amount?: number | string | null
  campaign_discount?: number | string | null
  points_used?: number | string | null
  metadata?: {
    coupon_code?: string | null
    coupon_discount?: number | string | null
  } | null
  /** Resolved campaign names (from applied_campaign_ids), optional. */
  campaignNames?: string[]
  attributed_kol_slug?: string | null
  /** 會員券（感謝券／回購券），由 member_coupons.used_order_id 反查而來。 */
  memberCoupon?: { code?: string | null; amount: number | string | null } | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function buildDiscountBreakdown(input: DiscountBreakdownInput): DiscountLine[] {
  const total = round2(Number(input.discount_amount ?? 0))
  if (total <= 0) return []

  const campaign = round2(Number(input.campaign_discount ?? 0))
  const coupon = round2(Number(input.metadata?.coupon_discount ?? 0))
  const points = round2(Number(input.points_used ?? 0))

  const lines: DiscountLine[] = []

  if (campaign > 0) {
    const names = (input.campaignNames ?? []).filter(Boolean)
    lines.push({
      key: "campaign",
      label: names.length > 0 ? `行銷活動折扣（${names.join("、")}）` : "行銷活動折扣",
      amount: campaign,
    })
  }
  if (coupon > 0) {
    const code = input.metadata?.coupon_code
    const kol = input.attributed_kol_slug
    const suffix = code ? `（${code}${kol ? `・KOL：${kol}` : ""}）` : ""
    lines.push({ key: "coupon", label: `優惠券折扣${suffix}`, amount: coupon })
  }
  if (points > 0) {
    lines.push({ key: "points", label: `點數折抵（${points.toLocaleString()} 點）`, amount: points })
  }

  // 會員券。金額以「總折扣扣掉其他項目後的餘額」為上限 —— 券面額跟實際折抵
  // 不一定相等（券可能只折得到部分金額），以訂單實際折掉的為準，才不會讓
  // 各行加起來超過 discount_amount。
  const memberCouponFace = round2(Number(input.memberCoupon?.amount ?? 0))
  const remainder = round2(total - campaign - coupon - points)
  const memberCoupon = Math.min(memberCouponFace, Math.max(0, remainder))
  if (memberCoupon > 0.009) {
    const code = input.memberCoupon?.code
    lines.push({
      key: "member_coupon",
      label: `會員券折扣${code ? `（${code}）` : ""}`,
      amount: memberCoupon,
    })
  }

  // 剩下來的才是會員等級折扣 —— 它是唯一沒有自己欄位的項目。目前三個等級的
  // 折扣率都是 0，所以實務上這一行不會出現；留著是因為後台隨時可以設。
  const member = round2(remainder - memberCoupon)
  if (member > 0.009) {
    lines.push({ key: "member", label: "會員等級折扣", amount: member })
  }

  // Legacy orders predating the breakdown columns: fall back to a single line
  // so the math always adds up to discount_amount.
  if (lines.length === 0) {
    lines.push({ key: "other", label: "折扣", amount: total })
  }
  return lines
}
