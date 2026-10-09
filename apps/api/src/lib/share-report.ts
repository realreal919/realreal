/**
 * 分享回報表單的驗證規則。
 *
 * 會員看到的只有「貼連結或傳截圖」，類型與點數都由管理者事後判斷，所以這裡
 * 不做任何分類，只確認這筆回報有可查證的內容、而且不是機器人送的。
 */

export type ShareReportInput = {
  link?: string | null
  screenshot?: string | null
  message?: string | null
  email?: string | null
  /** honeypot：真人看不到這個欄位，填了就是機器人 */
  website?: string | null
}

export type ShareReportValidation =
  | { ok: true; link: string | null; message: string | null; email: string | null }
  | { ok: false; error: string }

const MAX_MESSAGE = 500
const MAX_LINK = 2000

/** 寬鬆的 Email 檢查：擋掉明顯不是信箱的輸入，不做花俏的正則。 */
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/**
 * 連結只收 http(s)。
 *
 * 不限定站台 —— IG、Threads、Facebook、Dcard、PTT 之外還有部落格、YouTube，
 * 寫白名單只會讓真的有分享的人被擋在外面，而真偽本來就是管理者點進去看的。
 */
function normalizeLink(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (v.length > MAX_LINK) return null
  try {
    const u = new URL(v)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.toString()
  } catch {
    return null
  }
}

export function validateShareReport(
  input: ShareReportInput,
  { isMember }: { isMember: boolean },
): ShareReportValidation {
  // honeypot 命中就假裝成功，不告訴對方被擋了 —— 回錯誤只會讓人改一改再試。
  if (typeof input.website === "string" && input.website.trim() !== "") {
    return { ok: false, error: "__silent__" }
  }

  const rawLink = typeof input.link === "string" ? input.link.trim() : ""
  const hasScreenshot = typeof input.screenshot === "string" && input.screenshot.trim() !== ""

  let link: string | null = null
  if (rawLink) {
    link = normalizeLink(rawLink)
    if (!link) return { ok: false, error: "連結看起來不正確，請確認是完整網址（http 或 https 開頭）" }
  }

  if (!link && !hasScreenshot) {
    return { ok: false, error: "請貼連結或上傳截圖" }
  }

  let email: string | null = null
  if (!isMember) {
    const raw = typeof input.email === "string" ? input.email.trim() : ""
    if (!raw) return { ok: false, error: "請留下 Email，我們才能對應到你的會員資料" }
    if (!looksLikeEmail(raw)) return { ok: false, error: "Email 格式看起來不正確" }
    email = raw.toLowerCase()
  } else if (typeof input.email === "string" && input.email.trim()) {
    email = input.email.trim().toLowerCase()
  }

  const message =
    typeof input.message === "string" && input.message.trim()
      ? input.message.trim().slice(0, MAX_MESSAGE)
      : null

  return { ok: true, link, message, email }
}

export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"])

export type DecodedImage = { buffer: Buffer; contentType: string; ext: string }

/**
 * 解析 data URL 形式的截圖。
 *
 * 限 JPG／PNG／HEIC、單檔 5 MB —— 手機直接拍的照片很容易超過，所以錯誤訊息
 * 要講清楚是「太大」而不是籠統的失敗。
 */
export function decodeScreenshot(dataUrl: string): DecodedImage | { error: string } {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl.trim())
  if (!m) return { error: "截圖格式無法辨識，請重新選擇一次" }
  const contentType = m[1].toLowerCase()
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return { error: "截圖請用 JPG、PNG 或 HEIC" }
  }
  let buffer: Buffer
  try {
    buffer = Buffer.from(m[2], "base64")
  } catch {
    return { error: "截圖讀取失敗，請重新選擇一次" }
  }
  if (buffer.length === 0) return { error: "截圖是空的，請重新選擇一次" }
  if (buffer.length > SCREENSHOT_MAX_BYTES) {
    return { error: "截圖超過 5 MB，請改傳小一點的圖" }
  }
  const ext =
    contentType === "image/png" ? "png" : contentType.includes("hei") ? "heic" : "jpg"
  return { buffer, contentType, ext }
}
