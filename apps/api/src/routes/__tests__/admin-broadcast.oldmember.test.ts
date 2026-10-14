import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn(), auth: { admin: { listUsers: vi.fn() } } },
}))

import { isOldMember } from "../admin-broadcast"

/**
 * 會員制度更新通知只寄給 2026-10-08（含）以前註冊的人。
 * 切點是台北時間的 10/9 00:00，而 created_at 存的是 UTC（10/8 16:00Z）——
 * 時區搞錯會讓 10/8 晚上註冊的老會員被誤判成新會員而漏寄。
 */
describe("isOldMember", () => {
  it("10/8 以前註冊的是老會員", () => {
    expect(isOldMember("2026-09-01T00:00:00.000Z")).toBe(true)
    expect(isOldMember("2026-10-08T00:00:00.000Z")).toBe(true)
  })

  it("★ 10/8 當天台北時間深夜註冊的仍算老會員（UTC 看起來像 10/8 下午）", () => {
    // 台北 10/8 23:59 = UTC 10/8 15:59
    expect(isOldMember("2026-10-08T15:59:59.000Z")).toBe(true)
  })

  it("★ 台北時間 10/9 00:00 起算新會員", () => {
    // 台北 10/9 00:00 = UTC 10/8 16:00
    expect(isOldMember("2026-10-08T16:00:00.000Z")).toBe(false)
    expect(isOldMember("2026-10-08T16:00:01.000Z")).toBe(false)
  })

  it("★ 實際被擋下來的那幾個人（10/9–10/14 註冊）", () => {
    for (const d of [
      "2026-10-09T04:19:14.800Z", // 柯美含
      "2026-10-10T09:56:39.288Z",
      "2026-10-11T13:19:29.064Z", // 王嘉綺（.tw）
      "2026-10-13T00:00:00.000Z",
      "2026-10-14T00:00:00.000Z",
    ]) {
      expect(isOldMember(d)).toBe(false)
    }
  })

  it("★ 讀不到註冊時間時當成新會員擋掉，不要寧可錯寄", () => {
    expect(isOldMember(null)).toBe(false)
    expect(isOldMember(undefined)).toBe(false)
    expect(isOldMember("")).toBe(false)
  })
})
