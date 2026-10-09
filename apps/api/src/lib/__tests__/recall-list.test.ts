/**
 * 一次性召回名單的分組。
 *
 * 邊界是真的會影響誰收到信：14 天的人應該由自動提醒接手，多發一封就是
 * 連續兩天打擾同一個人。
 */
import { describe, it, expect } from "vitest"
import { bucketFor, daysBetween, toCsv } from "../recall-list"

describe("bucketFor", () => {
  it("★ 0~14 天不處理 —— 自動提醒會接手", () => {
    expect(bucketFor(0)).toBeNull()
    expect(bucketFor(14)).toBeNull()
  })
  it("15~45 天是回購提醒組", () => {
    expect(bucketFor(15)).toBe("reminder")
    expect(bucketFor(45)).toBe("reminder")
  })
  it("46~90 天是好久不見組", () => {
    expect(bucketFor(46)).toBe("long_time_no_see")
    expect(bucketFor(90)).toBe("long_time_no_see")
  })
  it("★ 超過 90 天不在這次範圍 —— 隔三個月再問「還需要嗎」只會顯得我們很慢", () => {
    expect(bucketFor(91)).toBeNull()
  })
})

describe("daysBetween", () => {
  const now = new Date("2026-10-09T00:00:00Z")
  it("算得出天數", () => {
    expect(daysBetween("2026-09-09T00:00:00Z", now)).toBe(30)
  })
  it("日期壞掉時回 -1，不要當成 0 天", () => {
    expect(daysBetween("not a date", now)).toBe(-1)
  })
})

describe("toCsv", () => {
  const row = {
    user_id: "u1",
    email: "a@b.com",
    display_name: "王小明",
    first_order_id: "o1",
    first_order_number: "10000001",
    first_order_at: "2026-09-01T00:00:00Z",
    days_since: 38,
    bucket: "reminder" as const,
  }

  it("★ 開頭要有 BOM，不然 Excel 開中文是亂碼", () => {
    expect(toCsv([row]).startsWith("\uFEFF")).toBe(true)
  })

  it("含逗號的欄位要加引號", () => {
    const csv = toCsv([{ ...row, display_name: "王, 小明" }])
    expect(csv).toContain('"王, 小明"')
  })

  it("沒有資料時仍然有標題列", () => {
    expect(toCsv([]).split("\r\n")).toHaveLength(1)
  })
})
