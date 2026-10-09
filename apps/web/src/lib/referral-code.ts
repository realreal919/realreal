/**
 * 會員推薦碼在瀏覽器這一側的存放。
 *
 * 參數用 `?invite=`，不是 `?ref=` —— `ref` 已經被 KOL 推薦連結佔走了（見
 * KolRefCapture），兩套共用同一個參數的話，客人點了 KOL 連結再點朋友的邀請
 * 連結，兩邊會互相蓋掉，而且沒有任何地方看得出來。
 */
export const REFERRAL_PARAM = "invite"
export const REFERRAL_COOKIE = "member_ref"
/** 30 天。比 KOL 的 7 天長 —— 朋友推薦是「等我下次要買再說」的那種，不是看完廣告就下單。 */
export const REFERRAL_MAX_AGE = 60 * 60 * 24 * 30

/** 跟後端的 normalizeCode 同一套規則，前端先擋掉明顯不對的，少一次往返。 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.toUpperCase().replace(/[\s\-_]/g, "")
  if (cleaned.length !== 6) return null
  if (!/^[0-9A-Z]+$/.test(cleaned)) return null
  return cleaned
}

export function readReferralCookie(): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${REFERRAL_COOKIE}=([^;]*)`))
  return m ? normalizeReferralCode(decodeURIComponent(m[1])) : null
}

export function writeReferralCookie(code: string): void {
  if (typeof document === "undefined") return
  const parts = [
    `${REFERRAL_COOKIE}=${encodeURIComponent(code)}`,
    `Max-Age=${REFERRAL_MAX_AGE}`,
    "Path=/",
    "SameSite=Lax",
  ]
  if (window.location.protocol === "https:") parts.push("Secure")
  document.cookie = parts.join("; ")
}

export function clearReferralCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = `${REFERRAL_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
}
