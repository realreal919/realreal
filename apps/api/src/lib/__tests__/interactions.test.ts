/**
 * 互動點數規則。
 *
 * 管理者在後台只做一個判斷 ——「這是哪一種分享」。點數、每月上限、升等資格
 * 都由這裡算；靠人記的話遲早有一筆會漏，而且事後很難發現。
 */
import { describe, it, expect } from "vitest"
import { canCount, checkUpgrade, monthlyCount, pointsFor, isInteractionType } from "../interactions"

const NOW = new Date("2026-10-09T00:00:00+08:00")
const at = (iso: string, type: string, points: number) => ({ type, points, occurred_on: iso })

describe("點數對照", () => {
  it("依店主定的點數", () => {
    expect(pointsFor("testimonial")).toBe(3)
    expect(pointsFor("social_share")).toBe(2)
    expect(pointsFor("platform_share")).toBe(3)
    expect(pointsFor("campaign_participation")).toBe(1)
    expect(pointsFor("referral")).toBe(5)
  })
  it("認不得的類型要擋在型別檢查", () => {
    expect(isInteractionType("testimonial")).toBe(true)
    expect(isInteractionType("whatever")).toBe(false)
  })
})

describe("每月上限", () => {
  const two = [at("2026-10-01", "testimonial", 3), at("2026-10-05", "testimonial", 3)]

  it("同類型本月已兩次就擋下", () => {
    const r = canCount(two, "testimonial", NOW)
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.reason).toContain("達上限")
  })

  it("★ 上限只看同一類型，別的類型不受影響", () => {
    expect(canCount(two, "social_share", NOW).allowed).toBe(true)
  })

  it("★ 上個月的次數不算進本月", () => {
    const lastMonth = [at("2026-09-28", "testimonial", 3), at("2026-09-29", "testimonial", 3)]
    expect(canCount(lastMonth, "testimonial", NOW).allowed).toBe(true)
  })

  it("本月一次還可以再記一次", () => {
    expect(canCount([two[0]], "testimonial", NOW).allowed).toBe(true)
  })

  it("monthlyCount 只數同月同類型", () => {
    expect(monthlyCount([...two, at("2026-09-01", "testimonial", 3)], "testimonial", NOW)).toBe(2)
  })
})

describe("知心條件 B（6 個月內 ≥6 點、≥2 種類型）", () => {
  it("★ 點數夠但只有一種類型 → 不符合", () => {
    const r = checkUpgrade(
      [at("2026-10-01", "testimonial", 3), at("2026-10-02", "testimonial", 3)],
      NOW,
    )
    expect(r.points).toBe(6)
    expect(r.typeCount).toBe(1)
    expect(r.eligible).toBe(false)
  })

  it("★ 兩種類型但點數不足 → 不符合", () => {
    const r = checkUpgrade(
      [at("2026-10-01", "social_share", 2), at("2026-10-02", "campaign_participation", 1)],
      NOW,
    )
    expect(r.points).toBe(3)
    expect(r.eligible).toBe(false)
  })

  it("兩個條件都滿足 → 可升級", () => {
    const r = checkUpgrade(
      [at("2026-10-01", "testimonial", 3), at("2026-10-02", "platform_share", 3)],
      NOW,
    )
    expect(r.points).toBe(6)
    expect(r.typeCount).toBe(2)
    expect(r.eligible).toBe(true)
  })

  it("★ 超過 6 個月的紀錄不算 —— 否則資格永遠不會失效", () => {
    const r = checkUpgrade(
      [at("2026-01-01", "testimonial", 3), at("2026-01-02", "platform_share", 3)],
      NOW,
    )
    expect(r.points).toBe(0)
    expect(r.eligible).toBe(false)
  })

  it("剛好在 6 個月邊界內要算", () => {
    const r = checkUpgrade(
      [at("2026-04-20", "testimonial", 3), at("2026-10-01", "platform_share", 3)],
      NOW,
    )
    expect(r.eligible).toBe(true)
  })

  it("沒有任何紀錄時不會爆", () => {
    expect(checkUpgrade([], NOW)).toEqual({ points: 0, typeCount: 0, eligible: false })
  })
})
