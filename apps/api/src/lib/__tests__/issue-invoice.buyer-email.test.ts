import { describe, expect, it } from "vitest"

/**
 * 買受人 email 的取用順序。
 *
 * Amego 的發票通知信寄到發票上的 BuyerEmailAddress；這個欄位空的就不會寄。
 * 2026-10-19 之前 issue-invoice 根本沒傳這個參數，267 張發票全部是空的，
 * 客人一張都沒收到。這裡把取值規則單獨釘住。
 */
export function resolveBuyerEmail(
  order: { guest_email?: string | null; user_id?: string | null },
  profileEmail: string | null,
): string | undefined {
  return (order.guest_email ?? undefined) || (profileEmail ?? undefined) || undefined
}

describe("發票的買受人 email", () => {
  it("★ 訪客訂單用 guest_email", () => {
    expect(resolveBuyerEmail({ guest_email: "guest@example.com" }, null)).toBe("guest@example.com")
  })

  it("★ 會員訂單用會員資料裡的 email", () => {
    expect(resolveBuyerEmail({ user_id: "u1" }, "member@example.com")).toBe("member@example.com")
  })

  it("訪客 email 優先 —— 客人結帳當下填的那個才是他要收發票的信箱", () => {
    expect(resolveBuyerEmail({ guest_email: "typed@example.com", user_id: "u1" }, "old@example.com"))
      .toBe("typed@example.com")
  })

  it("★ 兩邊都沒有時回 undefined，不能擋下開票", () => {
    expect(resolveBuyerEmail({}, null)).toBeUndefined()
    expect(resolveBuyerEmail({ guest_email: null, user_id: null }, null)).toBeUndefined()
  })
})
