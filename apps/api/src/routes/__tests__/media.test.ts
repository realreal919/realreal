import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    },
  },
}))

import { app } from "../../app"
import { supabase } from "../../lib/supabase"

const mockMedia = {
  id: "media-1",
  url: "https://rywrdbqllbbeptudqmom.supabase.co/storage/v1/object/public/media/uploads/123-abc.jpg",
  filename: "photo.jpg",
  mime_type: "image/jpeg",
  size_bytes: 102400,
  alt_text: null,
  created_at: new Date().toISOString(),
}

function mockEditorAuth() {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: "user-editor", email: "editor@test.com" } },
    error: null,
  } as any)
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
// GET /admin/media (auth + editor)
// ---------------------------------------------------------------------------

describe("GET /admin/media", () => {
  it("returns 401 without auth", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    } as any)

    const res = await request(app).get("/admin/media")
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-editor/non-admin", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "user-viewer", email: "viewer@test.com" } },
      error: null,
    } as any)
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "customer" }, error: null }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .get("/admin/media")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(403)
  })

  it("returns paginated media for editor", async () => {
    mockEditorAuth()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "editor" }, error: null }),
        } as any
      }
      if (table === "media") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data: [mockMedia], error: null, count: 1 }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .get("/admin/media?page=1&limit=20")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("data")
    expect(res.body).toHaveProperty("pagination")
    expect(res.body.pagination).toHaveProperty("page")
    expect(res.body.pagination).toHaveProperty("total")
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it("returns paginated media for admin", async () => {
    mockAdminAuth()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
        } as any
      }
      if (table === "media") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn().mockResolvedValue({ data: [mockMedia], error: null, count: 1 }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .get("/admin/media")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("data")
  })
})

// ---------------------------------------------------------------------------
// POST /admin/media/upload (auth + editor)
// ---------------------------------------------------------------------------

describe("POST /admin/media/upload", () => {
  it("returns 401 without auth", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    } as any)

    const res = await request(app)
      .post("/admin/media/upload")
      .attach("file", Buffer.from("fake image"), "test.jpg")
    expect(res.status).toBe(401)
  })

  it("returns 400 when no file provided", async () => {
    mockEditorAuth()

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
      .post("/admin/media/upload")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("No file provided")
  })

  it("uploads a file for editor", async () => {
    mockEditorAuth()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "editor" }, error: null }),
        } as any
      }
      if (table === "media") {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockMedia, error: null }),
        } as any
      }
      return {} as any
    })

    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
    } as any)

    const res = await request(app)
      .post("/admin/media/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("file", Buffer.from("fake image data"), "photo.jpg")
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty("data")
    expect(res.body.data).toHaveProperty("url")
  })

  it("returns 500 when storage upload fails", async () => {
    mockEditorAuth()

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

    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: { message: "storage error" } }),
    } as any)

    const res = await request(app)
      .post("/admin/media/upload")
      .set("Authorization", "Bearer valid-token")
      .attach("file", Buffer.from("fake image data"), "photo.jpg")
    expect(res.status).toBe(500)
    expect(res.body.error).toBe("storage error")
  })
})

// ---------------------------------------------------------------------------
// DELETE /admin/media/:id (auth + admin)
// ---------------------------------------------------------------------------

describe("DELETE /admin/media/:id", () => {
  it("returns 401 without auth", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    } as any)

    const res = await request(app).delete("/admin/media/media-1")
    expect(res.status).toBe(401)
  })

  it("returns 403 for editor (admin-only delete)", async () => {
    mockEditorAuth()

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
      .delete("/admin/media/media-1")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(403)
  })

  it("returns 404 when media not found", async () => {
    mockAdminAuth()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
        } as any
      }
      if (table === "media") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
        } as any
      }
      return {} as any
    })

    const res = await request(app)
      .delete("/admin/media/nonexistent")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("Media not found")
  })

  it("deletes media for admin", async () => {
    mockAdminAuth()

    let mediaCallCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
        } as any
      }
      if (table === "media") {
        mediaCallCount++
        if (mediaCallCount === 1) {
          // Fetch record
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockMedia, error: null }),
          } as any
        }
        // Delete record
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        } as any
      }
      return {} as any
    })

    vi.mocked(supabase.storage.from).mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: null }),
    } as any)

    const res = await request(app)
      .delete("/admin/media/media-1")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(204)
  })

  it("returns 500 when storage remove fails", async () => {
    mockAdminAuth()

    let mediaCallCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
        } as any
      }
      if (table === "media") {
        mediaCallCount++
        if (mediaCallCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockMedia, error: null }),
          } as any
        }
        return {} as any
      }
      return {} as any
    })

    vi.mocked(supabase.storage.from).mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: { message: "storage delete error" } }),
    } as any)

    const res = await request(app)
      .delete("/admin/media/media-1")
      .set("Authorization", "Bearer valid-token")
    expect(res.status).toBe(500)
    expect(res.body.error).toBe("storage delete error")
  })
})
