import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * 取消訂單要把「首購禮計量勺」的資格還給客人。
 *
 * 付款成功時 enqueue-post-payment 會把 user_profiles.received_scoop 標成 true。
 * 取消流程原本會還原庫存、優惠券、首購折扣、推薦獎勵 —— 就是少了這一個，於是
 * 「付款成功 → 退款取消」的客人勺子永遠拿不到，畫面上也看不出原因
 * （#10000382，2026-10-25）。單純刷卡失敗的訂單不會中，因為那種訂單根本沒跑到
 * 付款後流程，標記從來沒被設上。
 *
 * 這組測試盯三件事：該還的要還、別人靠有效訂單真的領到的不能被收回、
 * 這張訂單沒附勺子就不要亂動。
 */

const SCOOP_ID = "scoop-product-id"

type Row = Record<string, unknown>

let orderRow: Row | null
let otherOrders: Row[]
let profileUpdate: Row | null
let profileConds: Record<string, unknown>

function chainFor(table: string) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: vi.fn(self),
    update: vi.fn((v: Row) => {
      if (table === "user_profiles") profileUpdate = v
      return chain
    }),
    eq: vi.fn((col: string, val: unknown) => {
      if (table === "user_profiles") profileConds[`eq:${col}`] = val
      return chain
    }),
    neq: vi.fn(self),
    is: vi.fn(self),
    not: vi.fn(self),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: table === "products" ? { id: SCOOP_ID } : orderRow,
        error: null,
      }),
    ),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: table === "orders" ? otherOrders : [], error: null }).then(resolve),
  })
  return chain
}

vi.mock("../supabase", () => ({ supabase: { from: vi.fn((t: string) => chainFor(t)) } }))
vi.mock("../settings", () => ({ getSetting: vi.fn(async () => "measuring-spoon") }))
vi.mock("../amego", () => ({ voidInvoice: vi.fn() }))
vi.mock("../ecpay-logistics", () => ({ cancelEcpayLogistics: vi.fn() }))
vi.mock("../refund-payment", () => ({ refundPayment: vi.fn() }))
vi.mock("../points", () => ({ refundOrderPoints: vi.fn() }))
vi.mock("../tier", () => ({ decrementSpendOnRefund: vi.fn() }))

import { releaseScoopGiftClaim } from "../cancel-order"

const withScoop = { user_id: "u1", free_items: [{ product_id: SCOOP_ID, name: "量匙" }] }

describe("取消訂單還原計量勺資格", () => {
  beforeEach(() => {
    orderRow = null
    otherOrders = []
    profileUpdate = null
    profileConds = {}
  })

  it("★ 這張訂單附過勺子、客人沒有別的有效訂單 → 把 received_scoop 還原", async () => {
    orderRow = withScoop
    await releaseScoopGiftClaim("o1")
    expect(profileUpdate).toEqual({ received_scoop: false })
    expect(profileConds["eq:user_id"]).toBe("u1")
    // 只動本來標著 true 的那一列，避免把沒領過的人也寫一次
    expect(profileConds["eq:received_scoop"]).toBe(true)
  })

  it("★ 另一張有效訂單也附了勺子 → 不能收回，那支是真的送出去了", async () => {
    orderRow = withScoop
    otherOrders = [{ id: "o2", free_items: [{ product_id: SCOOP_ID }] }]
    await releaseScoopGiftClaim("o1")
    expect(profileUpdate).toBeNull()
  })

  it("這張訂單沒附勺子 → 什麼都不做", async () => {
    orderRow = { user_id: "u1", free_items: [{ product_id: "other-gift" }] }
    await releaseScoopGiftClaim("o1")
    expect(profileUpdate).toBeNull()
  })

  it("訪客訂單（沒有 user_id）→ 什麼都不做", async () => {
    orderRow = { user_id: null, free_items: [{ product_id: SCOOP_ID }] }
    await releaseScoopGiftClaim("o1")
    expect(profileUpdate).toBeNull()
  })
})
