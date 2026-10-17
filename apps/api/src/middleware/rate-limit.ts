import rateLimit, { ipKeyGenerator } from "express-rate-limit"
import type { Request } from "express"

/**
 * 流量限制。
 *
 * 2026-10-17 安全檢查發現：站上兩個公開端點可以被無限次呼叫，而訂單編號是
 * 10000001 連號遞增 ——
 *   - GET /orders/by-number/:n/status 回得出每筆訂單的金額、付款與出貨方式
 *   - POST /auth/email-exists 回得出某個 email 是不是會員
 * 兩者合起來就是一份可以全自動抓完的客戶名單。
 *
 * **不做全站限制**：前台的目錄、設定、商品這些端點是 Vercel 的伺服器在呼叫
 * （SSR），幾百個客人共用少數幾個 Vercel IP。對它們做 IP 限制等於整站一起被
 * 擋掉。所以只限制「由客人的瀏覽器直接呼叫、而且能問出別人資料」的那幾支。
 */

/** Railway 在前面有一層反向代理，不信任它的話 req.ip 全部都是代理的 IP ——
 *  限制器會把所有人當成同一個人，第一個達標之後全站就被鎖死。 */
export const TRUST_PROXY_HOPS = 1

const baseOptions = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  // IPv6 要先正規化成 /64 再當 key，否則同一個人換一個位址就繞過了。
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
}

/**
 * 訂單狀態查詢。
 *
 * 正常客人：結帳完成頁每 3 秒輪詢一次、最多 2 分鐘 ≈ 40 次，而且只有結帳當下
 * 會用到。120 次／10 分鐘對真實使用者綽綽有餘，但要掃完 463 筆訂單得花 40 分鐘
 * 以上，而且每一筆都留在記錄裡。
 */
export const orderStatusLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 120,
  message: { error: "查詢過於頻繁，請稍後再試" },
})

/** 帳號是否存在。正常註冊／登入流程一次用 1~2 次，20 次／10 分鐘很夠。 */
export const emailLookupLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 20,
  message: { error: "查詢過於頻繁，請稍後再試" },
})

/** 寫入型的公開端點（聯絡表單、分享回報）：擋廣告機器人。 */
export const publicWriteLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { error: "送出次數過多，請稍後再試" },
})
