/**
 * 到貨通知。
 *
 * 這裡鎖住的三件事，都是「客人永遠不會發現，但會讓他空等」的那一類：
 *   1. 重複登記不能回錯誤 —— 回錯誤客人會以為沒登記到，再按一次還是錯。
 *   2. 寄信失敗的人必須留在名單上 —— 先整批標記再寄的話，失敗的那位就從名單
 *      消失了，沒有人會發現他沒收到。
 *   3. 名單是別人的 email，只有管理者能讀。
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

vi.mock("../../lib/email", () => ({
  sendEmail: vi.fn(),
  parseRecipients: vi.fn(() => []),
}))

import { app } from "../../app"
import { supabase } from "../../lib/supabase"
import { sendEmail } from "../../lib/email"

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111"

function mockAdminAuth() {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: "user-admin", email: "admin@test.com" } },
    error: null,
  } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /restock", () => {
  it("登記成功", async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === "products") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: PRODUCT_ID, name: "可可 300 克", is_active: true },
            error: null,
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }) as any)

    const res = await request(app)
      .post("/restock")
      .send({ productId: PRODUCT_ID, email: "someone@example.com" })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it("★ 同一個信箱重複登記照樣回成功，不要讓客人以為失敗", async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === "products") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: PRODUCT_ID, name: "可可 300 克", is_active: true },
            error: null,
          }),
        }
      }
      return {
        insert: vi.fn().mockResolvedValue({
          error: { message: 'duplicate key value violates unique constraint "uniq_restock_pending"' },
        }),
      }
    }) as any)

    const res = await request(app)
      .post("/restock")
      .send({ productId: PRODUCT_ID, email: "someone@example.com" })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it("信箱格式不對就擋下來", async () => {
    const res = await request(app)
      .post("/restock")
      .send({ productId: PRODUCT_ID, email: "not-an-email" })
    expect(res.status).toBe(400)
  })

  it("商品不存在時不留下孤兒資料", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any)

    const res = await request(app)
      .post("/restock")
      .send({ productId: PRODUCT_ID, email: "someone@example.com" })
    expect(res.status).toBe(404)
  })
})

describe("GET /admin/restock", () => {
  it("★ 沒有登入不能看別人的信箱", async () => {
    const res = await request(app).get("/admin/restock")
    expect(res.status).toBe(401)
  })
})

describe("POST /admin/restock/:productId/notify", () => {
  function mockNotifyTables(opts: { sendFails?: string[] } = {}) {
    const updated: string[] = []
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      // requireAdmin 會先查 user_profiles.role
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
        }
      }
      if (table === "products") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: PRODUCT_ID, name: "可可 300 克", slug: "cocoa300" },
            error: null,
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({
          data: [
            { id: "s1", email: "a@example.com" },
            { id: "s2", email: "b@example.com" },
          ],
          error: null,
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((_col: string, id: string) => {
            updated.push(id)
            return Promise.resolve({ error: null })
          }),
        }),
      }
    }) as any)

    vi.mocked(sendEmail).mockImplementation((async ({ to }: { to: string | string[] }) => {
      if (opts.sendFails?.includes(String(to))) throw new Error("smtp boom")
    }) as any)

    return updated
  }

  it("寄給名單上的每一位，並把他們標記為已通知", async () => {
    mockAdminAuth()
    const updated = mockNotifyTables()

    const res = await request(app)
      .post(`/admin/restock/${PRODUCT_ID}/notify`)
      .set("Authorization", "Bearer token")

    expect(res.status).toBe(200)
    expect(res.body.sent).toBe(2)
    expect(res.body.failed).toBe(0)
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2)
    expect(updated).toEqual(["s1", "s2"])
  })

  it("★ 寄失敗的人留在名單上，可以再按一次", async () => {
    mockAdminAuth()
    const updated = mockNotifyTables({ sendFails: ["b@example.com"] })

    const res = await request(app)
      .post(`/admin/restock/${PRODUCT_ID}/notify`)
      .set("Authorization", "Bearer token")

    expect(res.status).toBe(200)
    expect(res.body.sent).toBe(1)
    expect(res.body.failed).toBe(1)
    expect(res.body.failedEmails).toEqual(["b@example.com"])
    // 失敗的那位沒有被標記 —— 標了就等於從名單上消失，永遠收不到通知。
    expect(updated).toEqual(["s1"])
  })

  it("★ 沒有登入不能觸發寄信", async () => {
    const res = await request(app).post(`/admin/restock/${PRODUCT_ID}/notify`)
    expect(res.status).toBe(401)
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
  })
})
