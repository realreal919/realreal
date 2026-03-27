import { describe, it, expect, vi } from "vitest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

import { computeNewTier } from "../../lib/tier"

const mockTiers = [
  { id: "tier-diamond", name: "鑽石會員", min_spend: 30000 },
  { id: "tier-gold", name: "金卡會員", min_spend: 10000 },
  { id: "tier-silver", name: "銀卡會員", min_spend: 3000 },
  { id: "tier-basic", name: "一般會員", min_spend: 0 },
]

describe("computeNewTier", () => {
  it("returns diamond tier when spend >= 30000", () => {
    const result = computeNewTier(35000, mockTiers)
    expect(result).toBeDefined()
    expect(result?.name).toBe("鑽石會員")
    expect(result?.id).toBe("tier-diamond")
  })

  it("returns basic tier when spend is 0", () => {
    const result = computeNewTier(0, mockTiers)
    expect(result).toBeDefined()
    expect(result?.name).toBe("一般會員")
    expect(result?.id).toBe("tier-basic")
  })
})
