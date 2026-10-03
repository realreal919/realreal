import { describe, expect, it } from "vitest"
import { formatRemaining, limitedOfferFor, remainingParts } from "../limited-offers"

const END = "2026-10-05T00:00:00+08:00"
const at = (iso: string) => new Date(iso).getTime()

describe("remainingParts", () => {
  it("把剩餘時間拆成天時分秒", () => {
    expect(remainingParts(END, at("2026-10-03T16:17:45+08:00"))).toEqual({
      days: 1, hours: 7, minutes: 42, seconds: 15,
    })
  })

  it("★ 結束後回 null —— 倒數不會停在 00:00:00 繼續掛在頁面上", () => {
    expect(remainingParts(END, at("2026-10-05T00:00:00+08:00"))).toBeNull()
    expect(remainingParts(END, at("2026-10-05T00:00:01+08:00"))).toBeNull()
  })

  it("★ 結束前一秒還在", () => {
    expect(remainingParts(END, at("2026-10-04T23:59:59+08:00"))).toEqual({
      days: 0, hours: 0, minutes: 0, seconds: 1,
    })
  })

  it("時間字串壞掉時回 null，不顯示 NaN", () => {
    expect(remainingParts("不是時間")).toBeNull()
  })
})

describe("formatRemaining", () => {
  it("超過一天講天數", () => {
    expect(formatRemaining({ days: 1, hours: 7, minutes: 42, seconds: 15 })).toBe("1 天 07:42:15")
  })
  it("不到一天只留時鐘，個位數補零", () => {
    expect(formatRemaining({ days: 0, hours: 7, minutes: 2, seconds: 5 })).toBe("07:02:05")
  })
})

describe("limitedOfferFor", () => {
  it("★ 兩個穩定補給組合有檔期，結束時間是台北 10/4 24:00", () => {
    for (const slug of ["protein-30pack-mix", "60-day-vegan-protein"]) {
      const offer = limitedOfferFor(slug)
      expect(offer?.label).toBe("限時方案")
      expect(new Date(offer!.endsAt).toISOString()).toBe("2026-10-04T16:00:00.000Z")
    }
  })
  it("其他商品沒有檔期", () => {
    expect(limitedOfferFor("vegan-protein-powder-original")).toBeNull()
  })
})
