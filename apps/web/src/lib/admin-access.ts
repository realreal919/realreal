/**
 * 誰可以進後台。
 *
 * 2026-10-11 修掉的漏洞：原本的守門是「黑名單」—— 只擋 role === "viewer"，其餘
 * 一律放行。但資料表裡 272 個一般會員的 role 是 "customer"（只有 1 個 "viewer"），
 * 於是任何人登入後在網址列打 /admin 就會進到後台的框架畫面。API 每一支都另外驗
 * 權限，所以拿不到也改不了資料，但後台的選單與版面結構會被看到。
 *
 * 黑名單的問題是：每新增一種角色，預設就是「可以進後台」。白名單反過來，
 * 預設是擋住，新增角色要明確加進來才通得過。
 */
export const ADMIN_ROLES = ["admin", "editor"] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]

/**
 * 讀不到 user_profiles（沒有那一列、查詢失敗）時一律當成沒有權限 —— 判斷不出來
 * 就擋住，不要放行。
 */
export function canAccessAdmin(role: string | null | undefined): role is AdminRole {
  return typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(role)
}
