/**
 * 限時方案：商品頁上的倒數計時。
 *
 * 時間寫在這裡而不是資料庫，是因為這種檔期通常是「這一次」的決定 —— 寫在程式裡
 * 看得到、改得動、也進得了 git 紀錄；真的變成常態活動時再搬進後台。
 * 結束時間一律用 ISO 字串帶時區，免得「10/4 24:00」被當成 UTC 早了八小時。
 */
export type LimitedOffer = { endsAt: string; label: string }

/** slug → 檔期。沒列到的商品不顯示倒數。 */
export const LIMITED_OFFERS: Record<string, LimitedOffer> = {
  // 穩定補給 30 天／60 天：限時方案至 2026/10/4 24:00（台北時間）
  "protein-30pack-mix": { endsAt: "2026-10-05T00:00:00+08:00", label: "限時方案" },
  "60-day-vegan-protein": { endsAt: "2026-10-05T00:00:00+08:00", label: "限時方案" },
}

export function limitedOfferFor(slug: string): LimitedOffer | null {
  return LIMITED_OFFERS[slug] ?? null
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
