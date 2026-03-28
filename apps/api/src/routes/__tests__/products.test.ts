import { describe, it, expect, vi } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

import { app } from "../../app"
import { supabase } from "../../lib/supabase"

const mockProduct = {
  id: "prod-1",
  name: "益生菌膠囊",
  slug: "probiotic-capsule",
  description: "每日益生菌補充",
  category_id: "cat-1",
  images: [],
  is_active: true,
  created_at: new Date().toISOString(),
}

describe("GET /products", () => {
  it("returns paginated products", async () => {
    const mockProductsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      textSearch: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [mockProduct],
        error: null,
        count: 1,
      }),
      order: vi.fn().mockReturnThis(),
    }
    const mockVariantsQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ product_id: "prod-1", price: 100, stock_qty: 10 }],
        error: null,
      }),
    }
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "product_variants") return mockVariantsQuery as any
      return mockProductsQuery as any
    })

    const res = await request(app).get("/products?page=1&limit=20")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("data")
    expect(res.body).toHaveProperty("total")
  })
})

describe("GET /products/:slug", () => {
  it("returns 404 for unknown slug", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
    } as any)

    const res = await request(app).get("/products/nonexistent-slug")
    expect(res.status).toBe(404)
  })
})

describe("POST /products", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/products")
      .send({ name: "New Product", slug: "new-product" })
    expect(res.status).toBe(401)
  })
})
