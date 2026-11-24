import { beforeEach, describe, expect, it, vi } from "vitest"

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock("../supabase", () => ({ supabase: { from } }))

import { preorderVariantIds } from "../preorder"

/** 建一個假的查詢鏈：.select().in().eq() → 回傳 result。 */
function mockChain(result: { data?: unknown; error?: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  const inFn = vi.fn().mockReturnValue({ eq })
  const select = vi.fn().mockReturnValue({ in: inFn })
  from.mockReturnValue({ select } as never)
  return { select, in: inFn, eq }
}

describe("preorderVariantIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("沒有 id 就不查資料庫", async () => {
    await expect(preorderVariantIds([])).resolves.toEqual(new Set())
    expect(from).not.toHaveBeenCalled()
  })

  it("只回傳預購商品的規格", async () => {
    mockChain({ data: [{ id: "v-preorder" }] })
    const got = await preorderVariantIds(["v-preorder", "v-normal"])
    expect(got.has("v-preorder")).toBe(true)
    expect(got.has("v-normal")).toBe(false)
  })

  it("重複的 id 只查一次", async () => {
    const chain = mockChain({ data: [] })
    await preorderVariantIds(["v-1", "v-1", "v-1"])
    expect(chain.in).toHaveBeenCalledWith("id", ["v-1"])
  })

  /**
   * 查詢失敗時回空集合 —— 全部照現貨規則扣庫存。
   * 反過來（失敗就當作全是預購）會讓整站在資料庫抖動的那幾秒不扣庫存，
   * 那是超賣；而這個方向最糟只是客人下不了單，會來問。
   */
  it("查詢失敗時當作沒有預購商品", async () => {
    mockChain({ error: { message: "boom" } })
    await expect(preorderVariantIds(["v-1"])).resolves.toEqual(new Set())
  })
})
