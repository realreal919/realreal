import { describe, it, expect } from "vitest"

// Role gate logic extracted for unit testing
function checkAdminAccess(
  role: string | null | undefined
): "allow" | "redirect_home" | "redirect_login" {
  if (role === "admin") return "allow"
  if (role === null || role === undefined) return "redirect_login"
  return "redirect_home"
}

describe("Admin role gate", () => {
  it("allows admin role", () => {
    expect(checkAdminAccess("admin")).toBe("allow")
  })

  it("redirects non-admin user to home", () => {
    expect(checkAdminAccess("user")).toBe("redirect_home")
  })

  it("redirects unauthenticated user to login", () => {
    expect(checkAdminAccess(null)).toBe("redirect_login")
    expect(checkAdminAccess(undefined)).toBe("redirect_login")
  })
})
