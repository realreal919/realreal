import { describe, expect, it } from "vitest"
import { ADMIN_ROLES, canAccessAdmin } from "../admin-access"

describe("canAccessAdmin", () => {
  it("admin 與 editor 可以進後台", () => {
    expect(canAccessAdmin("admin")).toBe(true)
    expect(canAccessAdmin("editor")).toBe(true)
  })

  it("★ customer 不能進後台（資料表裡 272 個一般會員就是這個角色）", () => {
    expect(canAccessAdmin("customer")).toBe(false)
  })

  it("viewer 不能進後台", () => {
    expect(canAccessAdmin("viewer")).toBe(false)
  })

  it("★ 讀不到角色時擋住，不是放行", () => {
    expect(canAccessAdmin(null)).toBe(false)
    expect(canAccessAdmin(undefined)).toBe(false)
    expect(canAccessAdmin("")).toBe(false)
  })

  it("★ 沒見過的角色預設擋住（白名單，不是黑名單）", () => {
    expect(canAccessAdmin("staff")).toBe(false)
    expect(canAccessAdmin("manager")).toBe(false)
    expect(canAccessAdmin("owner")).toBe(false)
  })

  it("角色比對區分大小寫，不做模糊比對", () => {
    expect(canAccessAdmin("Admin")).toBe(false)
    expect(canAccessAdmin(" admin")).toBe(false)
    expect(canAccessAdmin("administrator")).toBe(false)
  })

  it("白名單就是這兩個角色", () => {
    expect([...ADMIN_ROLES]).toEqual(["admin", "editor"])
  })
})
