import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

import { app } from "../../app"
import { supabase } from "../../lib/supabase"

const mockUser = {
  user_id: "user-2",
  display_name: "Editor User",
  role: "editor",
  created_at: new Date().toISOString(),
}

function mockAdminAuth() {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: "user-admin", email: "admin@test.com" } },
    error: null,
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET /admin/users (admin only)
// ---------------------------------------------------------------------------

describe("GET /admin/users", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/admin/users")
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-admin", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "user-editor", email: "editor@test.com" } },
      error: null,
    } as any)
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "editor" }, error: null }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .get("/admin/users")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(403)
  })

  it("returns user list for admin", async () => {
    mockAdminAuth()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        // admin middleware call returns admin role; list query returns users
        const singleFn = vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null })
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [mockUser], error: null }),
          single: singleFn,
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .get("/admin/users")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("data")
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// PUT /admin/users/:id/role (admin only)
// ---------------------------------------------------------------------------

describe("PUT /admin/users/:id/role", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .put("/admin/users/user-2/role")
      .send({ role: "editor" })
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-admin", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "user-editor", email: "editor@test.com" } },
      error: null,
    } as any)
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "editor" }, error: null }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .put("/admin/users/user-2/role")
      .set("Authorization", "Bearer valid-token")
      .send({ role: "editor" })
    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid role enum", async () => {
    mockAdminAuth()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .put("/admin/users/user-2/role")
      .set("Authorization", "Bearer valid-token")
      .send({ role: "superadmin" })
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty("error")
  })

  it("returns 400 when changing own role", async () => {
    mockAdminAuth()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .put("/admin/users/user-admin/role")
      .set("Authorization", "Bearer valid-token")
      .send({ role: "editor" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Cannot change your own role")
  })

  it("updates user role for admin", async () => {
    mockAdminAuth()

    const updated = { ...mockUser, role: "viewer" }
    let profileCallCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        profileCallCount++
        if (profileCallCount === 1) {
          // admin middleware check
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
          } as any
        }
        // update call
        return {
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: updated, error: null }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .put("/admin/users/user-2/role")
      .set("Authorization", "Bearer valid-token")
      .send({ role: "viewer" })
    expect(res.status).toBe(200)
    expect(res.body.data.role).toBe("viewer")
  })

  it("returns 404 when user not found", async () => {
    mockAdminAuth()

    let profileCallCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        profileCallCount++
        if (profileCallCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
          } as any
        }
        return {
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .put("/admin/users/nonexistent/role")
      .set("Authorization", "Bearer valid-token")
      .send({ role: "editor" })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("User not found")
  })
})
