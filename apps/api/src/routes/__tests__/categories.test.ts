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

const mockCategories = [
  { id: "cat-1", name: "保健品", slug: "supplements", parent_id: null, sort_order: 1 },
  { id: "cat-2", name: "益生菌", slug: "probiotics", parent_id: "cat-1", sort_order: 1 },
]

describe("GET /categories", () => {
  it("returns category tree", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockCategories, error: null }),
    } as any)

    const res = await request(app).get("/categories")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("data")
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe("POST /categories", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/categories")
      .send({ name: "New Category", slug: "new-cat" })
    expect(res.status).toBe(401)
  })
})
