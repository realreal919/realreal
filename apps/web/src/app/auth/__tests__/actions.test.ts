import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Supabase server client
const mockSignIn = vi.fn()
const mockSignUp = vi.fn()
const mockResetPassword = vi.fn()
const mockSignOut = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      resetPasswordForEmail: mockResetPassword,
      signOut: mockSignOut,
    },
  }),
}))

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

const { loginAction, registerAction, forgotPasswordAction } = await import("../actions")

describe("loginAction", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns error for invalid email", async () => {
    const fd = new FormData()
    fd.set("email", "not-an-email")
    fd.set("password", "password123")
    const result = await loginAction(null, fd)
    expect(result?.error).toBeTruthy()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it("returns error when Supabase auth fails", async () => {
    mockSignIn.mockResolvedValue({ error: { message: "Invalid credentials" } })
    const fd = new FormData()
    fd.set("email", "user@example.com")
    fd.set("password", "password123")
    const result = await loginAction(null, fd)
    expect(result?.error).toBe("Invalid credentials")
  })

  it("calls signInWithPassword with correct credentials", async () => {
    mockSignIn.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set("email", "user@example.com")
    fd.set("password", "password123")
    await loginAction(null, fd).catch(() => {}) // redirect throws in test
    expect(mockSignIn).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    })
  })
})

describe("registerAction", () => {
  it("returns error for short password", async () => {
    const fd = new FormData()
    fd.set("email", "user@example.com")
    fd.set("password", "short")
    fd.set("displayName", "Test User")
    const result = await registerAction(null, fd)
    expect(result?.error).toBeTruthy()
  })
})

describe("forgotPasswordAction", () => {
  it("returns error when email missing", async () => {
    const result = await forgotPasswordAction(null, new FormData())
    expect(result?.error).toBeTruthy()
  })

  it("returns success message on valid email", async () => {
    mockResetPassword.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set("email", "user@example.com")
    const result = await forgotPasswordAction(null, fd)
    expect(result?.success).toBeTruthy()
  })
})
