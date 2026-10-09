/**
 * 回購券：隨回購提醒發出的數位券，折夾鏈袋。
 *
 * 規則（規格 1.6）：
 *   - 金額 $50，發出後 14 天有效，每人一次
 *   - 限購物車含夾鏈袋商品時可用，折在夾鏈袋品項上
 *
 * 「夾鏈袋商品」用的是跟贈勺同一份 slug 清單（membership.scoop_trigger_slugs）。
 * 兩者講的是同一件事，分開維護的話，新增一個夾鏈袋商品只改了一邊，就會變成
 * 「買了會送勺但不能用回購券」這種沒人說得出原因的行為。
 */

export type CouponCartItem = {
  product_slug?: string | null
  /** 這一列實際成交的小計（元），已含加購價等調整 */
  line_total: number
  qty: number
}

export type RepurchaseCoupon = {
  id: string
  amount: number | string
  valid_until: string
  status: string
}

export type CouponApplication =
  | { applicable: true; couponId: string; discount: number }
  | { applicable: false; reason: string }

/** 購物車裡夾鏈袋品項的小計。折抵不能超過它 —— 券是折夾鏈袋，不是折整單。 */
export function zipbagSubtotal(items: CouponCartItem[], zipbagSlugs: string[]): number {
  if (zipbagSlugs.length === 0) return 0
  return items
    .filter((i) => i.product_slug != null && zipbagSlugs.includes(i.product_slug))
    .reduce((sum, i) => sum + (Number(i.line_total) || 0), 0)
}

/**
 * 這張券現在能不能用。
 *
 * 到期與已使用都在這裡判斷，不靠排程把過期券改狀態 —— 排程晚跑一天，
 * 客人就用到了不該能用的券。狀態欄位只是給後台看的。
 */
export function applyRepurchaseCoupon({
  coupon,
  items,
  zipbagSlugs,
  now = new Date(),
}: {
  coupon: RepurchaseCoupon | null | undefined
  items: CouponCartItem[]
  zipbagSlugs: string[]
  now?: Date
}): CouponApplication {
  if (!coupon) return { applicable: false, reason: "沒有可用的回購券" }
  if (coupon.status !== "active") return { applicable: false, reason: "這張回購券已經使用過了" }

  const until = new Date(coupon.valid_until)
  if (Number.isNaN(until.getTime())) return { applicable: false, reason: "回購券的有效期限不正確" }
  if (until.getTime() < now.getTime()) return { applicable: false, reason: "回購券已過期" }

  const eligible = zipbagSubtotal(items, zipbagSlugs)
  if (eligible <= 0) {
    return { applicable: false, reason: "回購券限購買夾鏈袋時使用" }
  }

  const amount = Number(coupon.amount) || 0
  if (amount <= 0) return { applicable: false, reason: "回購券金額不正確" }

  // 夾鏈袋小計不到券面額時，只折到剛好歸零，不讓它溢出去折別的品項
  return { applicable: true, couponId: coupon.id, discount: Math.min(amount, eligible) }
}

/**
 * 會員券的種類，決定「能折在哪些品項上」。
 *   repurchase —— 回購券，只折夾鏈袋
 *   referral   —— 推薦新朋友的購物金，全站可用
 *
 * 推薦購物金不限品項是刻意的：那 50 元是給新朋友的見面禮，限制品項等於要他
 * 先學會我們的商品分類才用得掉。回購券限夾鏈袋則是因為它的目的就是推回購。
 */
export type MemberCouponType = "repurchase" | "referral"

/**
 * 這張會員券現在能折多少。到期、已使用、可折範圍都在這裡判斷。
 *
 * 同時握有回購券與推薦購物金時由呼叫端挑一張 —— 兩張一起折會讓一筆 650 元的
 * 單折掉 100，那不是任何一檔活動答應過的事。
 */
export function applyMemberCoupon({
  coupon,
  items,
  zipbagSlugs,
  now = new Date(),
}: {
  coupon: (RepurchaseCoupon & { type?: string }) | null | undefined
  items: CouponCartItem[]
  zipbagSlugs: string[]
  now?: Date
}): CouponApplication {
  if (coupon?.type === "referral") {
    if (!coupon) return { applicable: false, reason: "沒有可用的購物金" }
    if (coupon.status !== "active") return { applicable: false, reason: "這筆購物金已經使用過了" }
    const until = new Date(coupon.valid_until)
    if (Number.isNaN(until.getTime())) return { applicable: false, reason: "購物金的有效期限不正確" }
    if (until.getTime() < now.getTime()) return { applicable: false, reason: "購物金已過期" }

    const subtotal = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0)
    if (subtotal <= 0) return { applicable: false, reason: "購物車是空的" }
    const amount = Number(coupon.amount) || 0
    if (amount <= 0) return { applicable: false, reason: "購物金金額不正確" }
    // 折不到負的：小計不到面額時只折到歸零
    return { applicable: true, couponId: coupon.id, discount: Math.min(amount, subtotal) }
  }
  return applyRepurchaseCoupon({ coupon, items, zipbagSlugs, now })
}

/** 提醒天數：依首購的主要品項決定。 */
export type ReminderKind = "sachet" | "jar_old" | "jar_new"

export type ReminderDays = Record<ReminderKind, number>

export const DEFAULT_REMINDER_DAYS: ReminderDays = {
  sachet: 6,
  jar_old: 3,
  jar_new: 6,
}

/**
 * 這張訂單的主要品項是哪一種，決定隔幾天提醒。
 *
 * 判斷順序刻意先看夾鏈袋：同時買了夾鏈袋與隨身包的人，手上撐比較久的是
 * 夾鏈袋，用隨身包的天數去提醒會太早。
 */
export function reminderKindFor(
  items: CouponCartItem[],
  zipbagSlugs: string[],
): ReminderKind | null {
  const hasZipbag = items.some(
    (i) => i.product_slug != null && zipbagSlugs.includes(i.product_slug) && i.qty > 0,
  )
  if (hasZipbag) return "jar_new"
  const hasAnything = items.some((i) => i.qty > 0)
  return hasAnything ? "sachet" : null
}

/**
 * 什麼時候該提醒。
 *
 * 到貨日多數時候拿不到 —— 7-11 走交貨便批次上傳，不經站上的綠界物流整合，
 * 所以綠界的取貨回報永遠不會回來。因此一律以「出貨日 + shipToArrivalDays」
 * 推估到貨，再加上品項的提醒天數。真有到貨日時當然優先用。
 */
export function reminderDueAt({
  shippedAt,
  deliveredAt,
  kind,
  days,
  shipToArrivalDays,
}: {
  shippedAt: string | null
  deliveredAt: string | null
  kind: ReminderKind
  days: ReminderDays
  shipToArrivalDays: number
}): Date | null {
  const base = deliveredAt ? new Date(deliveredAt) : shippedAt ? new Date(shippedAt) : null
  if (!base || Number.isNaN(base.getTime())) return null
  const arrival = new Date(base)
  if (!deliveredAt) arrival.setDate(arrival.getDate() + shipToArrivalDays)
  const due = new Date(arrival)
  due.setDate(due.getDate() + days[kind])
  return due
}
