import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * 驗證「使用者登入 token」不能用 service-role 的 client。
 *
 * 2026-10-25 停用 Supabase 的 legacy JWT API keys 之後，用 secret 金鑰呼叫
 * auth.getUser(使用者token) 一律回 Invalid token，所有經過 requireAuth 的後台
 * API 全部 401、頁面變成空白，而前台完全正常（走的是公開端點）—— 症狀只出現
 * 在後台，很容易被當成登入過期而不是金鑰問題。
 *
 * 這組測試釘住兩件事：有 publishable 金鑰時一定要換成它；沒有時要安靜退回舊的
 * client，不能因為少設一個環境變數就讓整個後台登不進去。
 */

vi.mock("../supabase", () => ({ supabase: { __source: "service-role" } }))

describe("驗證使用者 token 的 client", () => {
  const savedKey = process.env.SUPABASE_PUBLISHABLE_KEY
  const savedUrl = process.env.SUPABASE_URL

  beforeEach(() => {
    vi.resetModules()
    process.env.SUPABASE_URL = "https://example.supabase.co"
  })

  afterEach(() => {
    if (savedKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY
    else process.env.SUPABASE_PUBLISHABLE_KEY = savedKey
    if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl
  })

  it("★ 有設 publishable 金鑰時，用的不是 service-role 那個 client", async () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_testkey"
    const { authVerifier } = await import("../auth-verifier")
    expect((authVerifier as unknown as { __source?: string }).__source).toBeUndefined()
    expect(typeof authVerifier.auth.getUser).toBe("function")
  })

  it("沒設時退回原本的 client —— 少一個變數不能讓後台整個登不進去", async () => {
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    const { authVerifier } = await import("../auth-verifier")
    expect((authVerifier as unknown as { __source?: string }).__source).toBe("service-role")
  })
})
