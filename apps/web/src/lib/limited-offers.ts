/**
 * 限時檔期：商品頁的倒數計時。
 *
 * 結束時間來自商品本身的 `delist_at`（後台「自動下架時間」），跟真正執行下架的
 * 排程看同一個欄位。以前時間寫在這支程式裡，倒數跑完商品還留在架上照常賣
 * （2026-10-04 的 30 天組合就是這樣），現在兩邊不可能再對不起來。
 */
export type LimitedOffer = { endsAt: string; label: string }

/** 倒數框上的字。目前所有檔期共用一個說法，之後要分不同檔期再從後台帶。 */
export const LIMITED_OFFER_LABEL = "限時方案"

/** 商品有填下架時間就有檔期；沒填就沒有。 */
export function limitedOfferFor(delistAt: string | null | undefined): LimitedOffer | null {
  if (!delistAt) return null
  if (Number.isNaN(new Date(delistAt).getTime())) return null
  return { endsAt: delistAt, label: LIMITED_OFFER_LABEL }
}

/**
 * 剩餘時間拆成天／時／分／秒。已結束回 null —— 呼叫端據此整塊不顯示，
 * 過期的倒數停在 00:00:00 比沒有倒數更傷信任。
 */
export function remainingParts(
  endsAt: string,
  now: number = Date.now(),
): { days: number; hours: number; minutes: number; seconds: number } | null {
  const end = new Date(endsAt).getTime()
  if (!Number.isFinite(end)) return null
  const ms = end - now
  if (ms <= 0) return null
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

/** 「1 天 07:42:15」／不到一天時「07:42:15」。 */
export function formatRemaining(parts: { days: number; hours: number; minutes: number; seconds: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const clock = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
  return parts.days > 0 ? `${parts.days} 天 ${clock}` : clock
}
