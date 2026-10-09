/**
 * 會員券：發給個別會員、不是共用代碼的那一種。
 *
 * 目前兩種：
 *   repurchase —— 回購券。折 100、消費滿 1500 可用、附專屬優惠碼
 *   referral   —— 推薦相關（保留，目前推薦獎勵改走公益存款，沒有在發這種券）
 *
 * 2026-10-09 改版：回購券原本是「折 50、限夾鏈袋、結帳自動帶入」。店主定案的
 * 信件內容寫的是門檻與優惠碼、完全沒提夾鏈袋 —— 保留品項限制的話，客人照著
 * 信上的條件湊到 1500 卻折不下去，那是我們自己造的客訴。
 */

export type CouponCartItem = {
  product_slug?: string | null
  /** 這一列實際成交的小計（元），已含加購價等調整 */
  line_total: number
  qty: number
}

export type MemberCouponType = "repurchase" | "referral"

export type MemberCoupon = {
  id: string
  type?: string | null
  amount: number | string
  /** 使用門檻（元）。0 代表沒有門檻。 */
  min_order?: number | string | null
  valid_until: string
  status: string
  code?: string | null
}

/** 舊名保留，avoid churn in callers/tests。 */
export type RepurchaseCoupon = MemberCoupon

export type CouponApplication =
  | { applicable: true; couponId: string; discount: number }
  | { applicable: false; reason: string }

/** 購物車小計。門檻與折抵上限都看它。 */
export function cartSubtotal(items: CouponCartItem[]): number {
  return items.reduce((sum, i) => sum + (Number(i.line_total) || 0), 0)
}

/**
 * 這張券現在能不能用、能折多少。
 *
 * 到期與已使用都在這裡判斷，不靠排程把過期券改狀態 —— 排程晚跑一天，
 * 客人就用到了不該能用的券。狀態欄位只是給後台看的。
 */
export function applyMemberCoupon({
  coupon,
  items,
  now = new Date(),
}: {
  coupon: MemberCoupon | null | undefined
  items: CouponCartItem[]
  now?: Date
  /** 已不再使用。留著是為了不讓舊呼叫端編譯失敗。 */
  zipbagSlugs?: string[]
}): CouponApplication {
  if (!coupon) return { applicable: false, reason: "沒有可用的優惠券" }
  if (coupon.status !== "active") return { applicable: false, reason: "這張券已經使用過了" }

  const until = new Date(coupon.valid_until)
  if (Number.isNaN(until.getTime())) return { applicable: false, reason: "優惠券的有效期限不正確" }
  if (until.getTime() < now.getTime()) return { applicable: false, reason: "優惠券已過期" }

  const amount = Number(coupon.amount) || 0
  if (amount <= 0) return { applicable: false, reason: "優惠券金額不正確" }

  const subtotal = cartSubtotal(items)
  const minOrder = Number(coupon.min_order) || 0
  if (minOrder > 0 && subtotal < minOrder) {
    // 差多少要講出來 —— 只說「不符合條件」的話，客人只能自己試
    return {
      applicable: false,
      reason: `消費滿 ${minOrder} 元才能使用（目前 ${Math.round(subtotal)} 元）`,
    }
  }
  if (subtotal <= 0) return { applicable: false, reason: "購物車是空的" }

  // 小計不到面額時只折到歸零，不讓它溢出去折運費
  return { applicable: true, couponId: coupon.id, discount: Math.min(amount, subtotal) }
}

/**
 * 專屬優惠碼。會員看得懂、唸得出來，而且不會跟共用優惠碼長得一樣。
 *
 * 前綴 RE（回購）讓客服一眼看得出這是哪一種券；後面 6 碼去掉 0/O/1/I/L，
 * 因為這組碼會出現在信裡被抄來抄去。
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

export function generateCouponCode(
  prefix = "RE",
  random: () => number = Math.random,
): string {
  let out = ""
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  return `${prefix}${out}`
}

/** 使用者抄進來的碼正規化。大小寫、空白、破折號都吃掉。 */
export function normalizeCouponCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.toUpperCase().replace(/[\s\-_]/g, "")
  return /^[A-Z]{2}[0-9A-Z]{6}$/.test(cleaned) ? cleaned : null
}

/**
 * 信要在出貨後第幾天寄。
 *
 * 2026-10-09 改版：原本依品項算「到貨推估日 + N 天」。店主定案改成固定天數
 * ——回饋信第 14 天、回購提醒第 30 天。固定天數講得清楚、對得了帳，而且到貨日
 * 本來就多數拿不到（7-11 交貨便批次上傳，不經綠界物流，取貨回報永遠不會回來）。
 */
export function dueAfterShip(shippedAt: string | null, days: number): Date | null {
  if (!shippedAt) return null
  const base = new Date(shippedAt)
  if (Number.isNaN(base.getTime())) return null
  const due = new Date(base)
  due.setDate(due.getDate() + days)
  return due
}

export const DEFAULT_FEEDBACK_DAYS = 14
export const DEFAULT_REPURCHASE_DAYS = 30
export const DEFAULT_COUPON_AMOUNT = 100
export const DEFAULT_COUPON_MIN_ORDER = 1500
export const DEFAULT_COUPON_VALID_DAYS = 30

/** 這張訂單有沒有東西可以提醒。空單不寄。 */
export function hasAnyItem(items: CouponCartItem[]): boolean {
  return items.some((i) => i.qty > 0)
}
