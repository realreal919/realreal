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

const VALID_TOKEN = "valid-token"
const MOCK_USER_ID = "user-123"

function mockAuth() {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: MOCK_USER_ID, email: "test@example.com" } as never },
    error: null,
  })
}

const validCoupon = {
  id: "coupon-1",
  code: "SAVE10",
  type: "percentage",
  value: 10,
  min_order: 100,
  max_uses: 50,
  used_count: 5,
  expires_at: new Date(Date.now() + 86400_000).toISOString(), // tomorrow
  applicable_to: "order",
  is_active: true,
}

const expiredCoupon = {
  ...validCoupon,
  id: "coupon-2",
  code: "EXPIRED",
  expires_at: new Date(Date.now() - 86400_000).toISOString(), // yesterday
}

const exhaustedCoupon = {
  ...validCoupon,
  id: "coupon-3",
  code: "MAXED",
  max_uses: 10,
  used_count: 10,
}

describe("POST /coupons/validate", () => {
  beforeEach(() => {
    mockAuth()
  })

  it("valid coupon returns discount amount", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: validCoupon, error: null }),
    } as never)

    const res = await request(app)
      .post("/coupons/validate")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .send({ code: "SAVE10", order_amount: 500 })

    expect(res.status).toBe(200)
    expect(res.body.data).toBeDefined()
    expect(res.body.data.discount).toBe(50) // 10% of 500
    expect(res.body.data.final_amount).toBe(450)
  })

  it("expired coupon returns 400", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: expiredCoupon, error: null }),
    } as never)

    const res = await request(app)
      .post("/coupons/validate")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .send({ code: "EXPIRED", order_amount: 500 })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/expired/i)
  })

  it("exceeded max_uses returns 400", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: exhaustedCoupon, error: null }),
    } as never)

    const res = await request(app)
      .post("/coupons/validate")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .send({ code: "MAXED", order_amount: 500 })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/maximum usage/i)
  })
})
