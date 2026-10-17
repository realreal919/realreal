import { beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() }, rpc: vi.fn() },
}))

import { app } from "../../app"
import { supabase } from "../../lib/supabase"

function mockOrder(row: Record<string, unknown>) {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
  }
  vi.mocked(supabase.from).mockImplementation(() => q as never)
  return q
}

const base = {
  order_number: "10000348",
  status: "paid",
  payment_status: "paid",
  payment_method: "pchomepay",
  shipping_method: "cvs_711",
  total: 1280,
  guest_email: "guest@example.com",
}

describe("GET /orders/by-number/:n/status — 訪客 email 的外洩面", () => {
  beforeEach(() => vi.clearAllMocks())

  it("★ 剛下單的訪客訂單：回傳 email（結帳完成頁要用它預填註冊）", async () => {
    mockOrder({ ...base, user_id: null, created_at: new Date().toISOString() })
    const res = await request(app).get("/orders/by-number/10000348/status")
    expect(res.status).toBe(200)
    expect(res.body.data.guest_email).toBe("guest@example.com")
  })

  it("★ 一小時前的訪客訂單：不回傳 email —— 擋掉連號掃描撈名單", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    mockOrder({ ...base, user_id: null, created_at: old })
    const res = await request(app).get("/orders/by-number/10000349/status")
    expect(res.status).toBe(200)
    expect(res.body.data.guest_email).toBeNull()
    // 其餘欄位照常，結帳完成頁與付款輪詢不受影響
    expect(res.body.data.payment_status).toBe("paid")
    expect(res.body.data.total).toBe(1280)
  })

  it("已綁定帳號的訂單：不論多新都不回傳 email", async () => {
    mockOrder({ ...base, user_id: "user-1", created_at: new Date().toISOString() })
    const res = await request(app).get("/orders/by-number/10000350/status")
    expect(res.body.data.guest_email).toBeNull()
  })

  it("沒有 created_at 時保守處理（不回傳）", async () => {
    mockOrder({ ...base, user_id: null, created_at: null })
    const res = await request(app).get("/orders/by-number/10000351/status")
    expect(res.body.data.guest_email).toBeNull()
  })
})
