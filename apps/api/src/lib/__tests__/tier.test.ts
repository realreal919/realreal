import { describe, it, expect, vi } from "vitest"

// tier.ts imports ./supabase at module load (which throws if SUPABASE_* env
// vars are missing) and ./points. Stub both so we can import the pure
// tierBonusMatches helper without real I/O — mirrors the vi.mock pattern used
// in shipping.test.ts.
vi.mock("../supabase", () => ({ supabase: {} }))
vi.mock("../points", () => ({ adjustPoints: vi.fn() }))

import { tierBonusMatches, tierPeriodFields } from "../tier"

// Regression: the tier_upgrade_bonus consumer used to compare config.tier_id
// (a UUID the admin form NEVER writes) against the upgraded tier's UUID, so the
// match always failed and bonus points were never granted. The form actually
// saves config.tier_slug (e.g. "gold"). These assert the slug match works and
// the legacy tier_id fallback is preserved.
describe("tierBonusMatches", () => {
  const VIP_ID = "11111111-1111-1111-1111-111111111111"
  const GOLD_ID = "22222222-2222-2222-2222-222222222222"

  it("matches when config.tier_slug equals the upgraded tier's slug (the bug fix)", () => {
    expect(tierBonusMatches({ tier_slug: "gold" }, "gold", GOLD_ID)).toBe(true)
  })

  it("does NOT match when the upgraded slug differs from config.tier_slug", () => {
    expect(tierBonusMatches({ tier_slug: "diamond" }, "gold", GOLD_ID)).toBe(false)
  })

  it("legacy fallback: matches when config.tier_id equals the upgraded tier id", () => {
    // Old rows that keyed on the UUID instead of the slug still work, even when
    // the slug is unknown / unresolved.
    expect(tierBonusMatches({ tier_id: GOLD_ID }, null, GOLD_ID)).toBe(true)
  })

  it("legacy fallback does NOT match a different tier id", () => {
    expect(tierBonusMatches({ tier_id: VIP_ID }, "gold", GOLD_ID)).toBe(false)
  })

  it("tolerates surrounding whitespace in slug (robust string compare)", () => {
    expect(tierBonusMatches({ tier_slug: "  gold  " }, "gold", GOLD_ID)).toBe(true)
  })

  it("returns false for null/empty config or when nothing is resolvable", () => {
    expect(tierBonusMatches(null, "gold", GOLD_ID)).toBe(false)
    expect(tierBonusMatches({}, "gold", GOLD_ID)).toBe(false)
    expect(tierBonusMatches({ tier_slug: "gold" }, null, null)).toBe(false)
  })

  it("does not false-match empty-string slug against an unresolved (null) upgraded slug", () => {
    // Guards against "" === "" accidentally matching every campaign.
    expect(tierBonusMatches({ tier_slug: "" }, null, GOLD_ID)).toBe(false)
  })
})

/**
 * Regression for 2026-10-07: the admin "更換等級" endpoint wrote only
 * membership_tier_id, so a hand-set tier had no tier_expires_at. tier-expire
 * filters on `tier_expires_at is not null`, so those members kept the tier for
 * good — four of them were in that state when it was found.
 */
describe("tierPeriodFields", () => {
  const NOW = new Date("2026-10-07T03:00:00.000Z")

  it("★ 有效期的等級一定要寫出到期日，不然降等排程永遠掃不到", () => {
    const f = tierPeriodFields(12, NOW)
    expect(f.tier_expires_at).toBe("2027-10-07T03:00:00.000Z")
    expect(f.tier_started_at).toBe("2026-10-07T03:00:00.000Z")
  })

  it("換等級就是新的一期，重新認定的累計歸零", () => {
    expect(tierPeriodFields(12, NOW).tier_period_spend).toBe(0)
  })

  it("validity_months 為 0 或空值代表不過期", () => {
    expect(tierPeriodFields(0, NOW).tier_expires_at).toBeNull()
    expect(tierPeriodFields(null, NOW).tier_expires_at).toBeNull()
    expect(tierPeriodFields(undefined, NOW).tier_expires_at).toBeNull()
  })

  it("36 個月的同心之友跨年也要算對", () => {
    expect(tierPeriodFields(36, NOW).tier_expires_at).toBe("2029-10-07T03:00:00.000Z")
  })
})
