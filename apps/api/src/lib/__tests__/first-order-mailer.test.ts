/**
 * 出貨日的判定。
 *
 * 這是上線前抓到的真實錯誤：原本用 orders.updated_at 當出貨日，但它是「最後
 * 一次任何欄位被改動」的時間。實測 351 張已出貨訂單裡有 328 張的 updated_at
 * 離建立超過兩天 —— 批次改狀態、補發票、後台點一下都會把它推到今天，於是
 * 「出貨後第 14 天」整批算錯。
 */
import { describe, it, expect } from "vitest"
import { TYPICAL_SHIP_LAG_DAYS, shipDateOf } from "../first-order-mailer"

describe("shipDateOf", () => {
  it("有 metadata.shipped_at 就用它", () => {
    const d = shipDateOf({
      created_at: "2026-10-01T00:00:00Z",
      metadata: { shipped_at: "2026-10-06T09:52:37.621Z" },
    })
    expect(d?.toISOString()).toBe("2026-10-06T09:52:37.621Z")
  })

  it("★ 沒有 shipped_at 的舊訂單用「建立日 + 典型落差」，不是 updated_at", () => {
    const d = shipDateOf({ created_at: "2026-10-01T00:00:00Z", metadata: null })
    const expected = new Date("2026-10-01T00:00:00Z")
    expected.setDate(expected.getDate() + TYPICAL_SHIP_LAG_DAYS)
    expect(d?.toISOString()).toBe(expected.toISOString())
  })

  it("metadata 有但 shipped_at 壞掉時，退回建立日推估", () => {
    const d = shipDateOf({
      created_at: "2026-10-01T00:00:00Z",
      metadata: { shipped_at: "not a date" },
    })
    expect(d?.toISOString().slice(0, 10)).toBe("2026-10-03")
  })

  it("metadata 沒有 shipped_at 這個鍵也要能處理", () => {
    expect(shipDateOf({ created_at: "2026-10-01T00:00:00Z", metadata: {} })).not.toBeNull()
    expect(shipDateOf({ created_at: "2026-10-01T00:00:00Z" })).not.toBeNull()
  })

  it("建立日壞掉就回 null —— 寧可不寄，也不要用今天當基準亂算", () => {
    expect(shipDateOf({ created_at: "not a date", metadata: null })).toBeNull()
  })
})
