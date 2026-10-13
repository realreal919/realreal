import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * 這組測試盯的是一個「沉默失敗」的 bug：原本比對 status = "succeeded"，而這個
 * 系統從來沒寫過那個字（實際是 captured / paid / pending / failed），所以退款
 * 標記從上線到 2026-10-13 一筆都沒生效，而且沒有任何錯誤。#10000307 的客人
 * 帳單上還掛著 670 元。
 *
 * 所以測的重點不是「有沒有呼叫 update」，是**用什麼條件呼叫**。
 */

const captured: Record<string, unknown> = {}

function makeChain() {
  const chain: Record<string, unknown> = {
    update: vi.fn((v: unknown) => { captured.update = v; return chain }),
    eq: vi.fn((col: string, val: unknown) => {
      captured[`eq:${col}`] = val
      return chain
    }),
    in: vi.fn((col: string, vals: unknown) => {
      captured[`in:${col}`] = vals
      return chain
    }),
    not: vi.fn((col: string, op: string, vals: unknown) => {
      captured[`not:${col}`] = { op, vals }
      return chain
    }),
    select: vi.fn(() => Promise.resolve({ data: captured.rows ?? [{ id: "p1" }], error: null })),
  }
  return chain
}

vi.mock("../supabase", () => ({
  supabase: { from: vi.fn(() => makeChain()) },
}))
vi.mock("../email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  parseRecipients: vi.fn(() => []),
}))
vi.mock("../settings", () => ({
  getSettingOrEnv: vi.fn().mockResolvedValue(null),
}))

import { refundPayment } from "../refund-payment"

const ORDER = { id: "order-1", payment_method: "linepay", total: 670 }

describe("refundPayment — 要標到哪些付款紀錄", () => {
  beforeEach(() => {
    for (const k of Object.keys(captured)) delete captured[k]
  })

  it("★ 比對的是實際存在的狀態，不是從來沒用過的 succeeded", async () => {
    await refundPayment(ORDER, "重複下單")
    const statuses = captured["in:status"] as string[]
    expect(statuses).toContain("captured")
    expect(statuses).toContain("paid")
    // 舊值留著相容，但不能「只有」它 —— 只比對 succeeded 就是原本的 bug
    expect(statuses.length).toBeGreaterThan(1)
    expect(captured["eq:status"]).toBeUndefined()
  })

  it("★ 不碰 pending（超商取貨付款，錢還沒收）與 failed（根本沒扣成功）", async () => {
    await refundPayment(ORDER, "改變心意")
    const statuses = captured["in:status"] as string[]
    expect(statuses).not.toContain("pending")
    expect(statuses).not.toContain("failed")
  })

  it("只動這一張訂單的付款紀錄", async () => {
    await refundPayment(ORDER, "x")
    expect(captured["eq:order_id"]).toBe("order-1")
  })

  it("標成 refund_requested", async () => {
    await refundPayment(ORDER, "x")
    expect(captured.update).toEqual({ status: "refund_requested" })
  })

  it("沙盒金流排除在外，不要在待辦清單上製造假工作", async () => {
    await refundPayment(ORDER, "x")
    const n = captured["not:gateway"] as { op: string; vals: string }
    expect(n.op).toBe("in")
    expect(n.vals).toContain("test")
  })

  it("有標到就回報筆數", async () => {
    captured.rows = [{ id: "p1" }]
    const r = await refundPayment(ORDER, "x")
    expect(r.ok).toBe(true)
    expect(r.message).toContain("1")
  })

  it("★ 一筆都沒標到時要講出來，不能假裝成功", async () => {
    captured.rows = []
    const r = await refundPayment(ORDER, "x")
    expect(r.message).toContain("沒有需要退款")
  })
})
