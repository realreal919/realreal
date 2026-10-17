import { beforeEach, describe, expect, it, vi } from "vitest"
import { trackPurchase, trackKolView, trackAddToCart } from "../analytics"

type W = { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] }

const w = () => globalThis.window as unknown as W

beforeEach(() => {
  const g = globalThis as unknown as { window?: unknown }
  g.window = {} as W
})

describe("GA4 事件送出方式", () => {
  it("★ 用 gtag('event', ...) 送 —— 不是往 dataLayer 推物件", () => {
    const gtag = vi.fn()
    w().gtag = gtag
    trackKolView("clairelien")
    expect(gtag).toHaveBeenCalledWith("event", "view_promotion", {
      promotion_id: "kol:clairelien",
      promotion_name: "clairelien",
    })
  })

  it("★ 電商參數攤平在事件上 —— GTM 時代那層 ecommerce 包裝 gtag.js 不認得", () => {
    const gtag = vi.fn()
    w().gtag = gtag
    trackPurchase({
      id: "10000348",
      total: 1280,
      items: [{ sku: "251A-52", name: "初心原味 300克夾鏈袋", unit_price: 380, qty: 2 }],
    })
    const params = gtag.mock.calls[0][2] as Record<string, unknown>
    expect(gtag.mock.calls[0][0]).toBe("event")
    expect(gtag.mock.calls[0][1]).toBe("purchase")
    expect(params.ecommerce).toBeUndefined()
    expect(params).toMatchObject({ transaction_id: "10000348", value: 1280, currency: "TWD" })
    expect(params.items).toEqual([
      { item_id: "251A-52", item_name: "初心原味 300克夾鏈袋", price: 380, quantity: 2 },
    ])
  })

  it("沒有 KOL 就不要帶空的 affiliation", () => {
    const gtag = vi.fn()
    w().gtag = gtag
    trackPurchase({ id: "1", total: 10, items: [] })
    expect(gtag.mock.calls[0][2]).not.toHaveProperty("affiliation")
    trackPurchase({ id: "2", total: 10, items: [], kol_slug: "francis" })
    expect(gtag.mock.calls[1][2]).toMatchObject({ affiliation: "kol:francis" })
  })

  it("★ gtag 還沒定義時排進 dataLayer 佇列，載入後才補送", () => {
    trackAddToCart({ sku: "X", name: "量匙", unit_price: 45, qty: 1 })
    const queued = w().dataLayer
    expect(queued).toHaveLength(1)
    // gtag.js 只認 arguments 形式，所以佇列裡放的必須是類陣列的指令，
    // 而不是 { event: ... } 物件。
    const cmd = Array.from(queued![0] as ArrayLike<unknown>)
    expect(cmd[0]).toBe("event")
    expect(cmd[1]).toBe("add_to_cart")
    expect(cmd[2]).toMatchObject({ currency: "TWD", value: 45 })
  })

  it("伺服器端（沒有 window）不爆炸", () => {
    const g = globalThis as unknown as { window?: unknown }
    g.window = undefined
    expect(() => trackKolView("x")).not.toThrow()
  })
})
