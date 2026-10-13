import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn(), auth: { admin: { listUsers: vi.fn() } } },
}))

import { isExcludedFromMembershipUpdate } from "../admin-broadcast"

describe("isExcludedFromMembershipUpdate", () => {
  it("★ 店主自己的帳號（warmflying@gmail.com）不寄行銷信（2026-10-13 指定）", () => {
    expect(isExcludedFromMembershipUpdate("warmflying@gmail.com")).toBe(true)
  })

  it("大小寫、前後空白都要擋得住（信箱是從 auth.users 撈的，寫法不一定統一）", () => {
    expect(isExcludedFromMembershipUpdate("WarmFlying@Gmail.com")).toBe(true)
    expect(isExcludedFromMembershipUpdate("  warmflying@gmail.com  ")).toBe(true)
  })

  it("★ 其他人照常寄 —— 不能一不小心擋掉整份名單", () => {
    for (const e of [
      "love@realreal.cc",
      "someone@gmail.com",
      "warmflying@gmail.com.tw",
      "warmflying@hotmail.com",
      "notwarmflying@gmail.com",
      "",
    ]) {
      expect(isExcludedFromMembershipUpdate(e)).toBe(false)
    }
  })
})
