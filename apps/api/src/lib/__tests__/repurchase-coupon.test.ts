/**
 * 回購券。
 *
 * 券是「折夾鏈袋」而不是「折整單」，而且會員手上的券隨時可能已經過期或用過 ——
 * 這三件事如果有一件判斷錯，客人會在結帳頁看到一個折不下去的金額。
 */
import { describe, it, expect } from "vitest"
import {
  applyRepurchaseCoupon,
  reminderDueAt,
  reminderKindFor,
  zipbagSubtotal,
  DEFAULT_REMINDER_DAYS,
} from "../repurchase-coupon"

const ZIP = ["protein-5pack", "vegan-protein-or300"]
const NOW = new Date("2026-10-09T00:00:00+08:00")
const coupon = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  amount: 50,
  valid_until: "2026-10-20T00:00:00+08:00",
  status: "active",
  ...over,
})
const item = (slug: string | null, total: number, qty = 1) => ({
  product_slug: slug,
  line_total: total,
  qty,
})

describe("zipbagSubtotal", () => {
  it("只算夾鏈袋品項", () => {
    expect(zipbagSubtotal([item("protein-5pack", 1650), item("cocoa", 300)], ZIP)).toBe(1650)
  })
  it("清單是空的時候回 0，不要變成全部都算", () => {
    expect(zipbagSubtotal([item("protein-5pack", 1650)], [])).toBe(0)
  })
})

describe("applyRepurchaseCoupon", () => {
  const items = [item("protein-5pack", 1650), item("cocoa", 300)]

  it("有夾鏈袋、券有效 → 折 50", () => {
    const r = applyRepurchaseCoupon({ coupon: coupon(), items, zipbagSlugs: ZIP, now: NOW })
    expect(r.applicable).toBe(true)
    if (r.applicable) expect(r.discount).toBe(50)
  })

  it("★ 購物車只有隨身包 → 不能用，訊息要講清楚為什麼", () => {
    const r = applyRepurchaseCoupon({
      coupon: coupon(),
      items: [item("cocoa", 300)],
      zipbagSlugs: ZIP,
      now: NOW,
    })
    expect(r.applicable).toBe(false)
    if (!r.applicable) expect(r.reason).toContain("夾鏈袋")
  })

  it("★ 過期的券當下就擋 —— 不靠排程改狀態，排程晚跑一天就被用掉了", () => {
    const r = applyRepurchaseCoupon({
      coupon: coupon({ valid_until: "2026-10-08T00:00:00+08:00" }),
      items,
      zipbagSlugs: ZIP,
      now: NOW,
    })
    expect(r.applicable).toBe(false)
    if (!r.applicable) expect(r.reason).toContain("過期")
  })

  it("已使用過的券不能再用", () => {
    const r = applyRepurchaseCoupon({
      coupon: coupon({ status: "used" }),
      items,
      zipbagSlugs: ZIP,
      now: NOW,
    })
    expect(r.applicable).toBe(false)
  })

  it("★ 夾鏈袋小計不到券面額時只折到歸零，不溢出去折別的品項", () => {
    const r = applyRepurchaseCoupon({
      coupon: coupon(),
      items: [item("vegan-protein-or300", 30), item("cocoa", 500)],
      zipbagSlugs: ZIP,
      now: NOW,
    })
    expect(r.applicable).toBe(true)
    if (r.applicable) expect(r.discount).toBe(30)
  })

  it("沒有券時安靜回不適用", () => {
    expect(applyRepurchaseCoupon({ coupon: null, items, zipbagSlugs: ZIP, now: NOW }).applicable).toBe(false)
  })
})

describe("reminderKindFor", () => {
  it("★ 同時買夾鏈袋與隨身包時算夾鏈袋 —— 用隨身包的天數會提醒得太早", () => {
    expect(reminderKindFor([item("protein-5pack", 1650), item("cocoa", 300)], ZIP)).toBe("jar_new")
  })
  it("只有隨身包算 sachet", () => {
    expect(reminderKindFor([item("cocoa", 300)], ZIP)).toBe("sachet")
  })
  it("空購物車回 null", () => {
    expect(reminderKindFor([], ZIP)).toBeNull()
  })
})

describe("reminderDueAt", () => {
  const days = DEFAULT_REMINDER_DAYS
  // 用台灣時間比對。toISOString() 會轉成 UTC，+08:00 的凌晨會被切成前一天，
  // 看起來像少算一天，其實只是時區。
  const tw = (d: Date | null) =>
    d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d) : null

  it("★ 沒有到貨日時用出貨日 + 推估天數 —— 這是常態不是例外", () => {
    const due = reminderDueAt({
      shippedAt: "2026-10-01T00:00:00+08:00",
      deliveredAt: null,
      kind: "jar_new",
      days,
      shipToArrivalDays: 3,
    })
    // 10/01 出貨 + 3 天到貨 + 6 天 = 10/10
    expect(tw(due)).toBe("2026-10-10")
  })

  it("真的有到貨日時以它為準，不再加推估天數", () => {
    const due = reminderDueAt({
      shippedAt: "2026-10-01T00:00:00+08:00",
      deliveredAt: "2026-10-02T00:00:00+08:00",
      kind: "jar_new",
      days,
      shipToArrivalDays: 3,
    })
    expect(tw(due)).toBe("2026-10-08")
  })

  it("舊版夾鏈袋是第 3 天", () => {
    const due = reminderDueAt({
      shippedAt: "2026-10-01T00:00:00+08:00",
      deliveredAt: null,
      kind: "jar_old",
      days,
      shipToArrivalDays: 3,
    })
    expect(tw(due)).toBe("2026-10-07")
  })

  it("連出貨日都沒有時回 null，不要亂猜一個日期", () => {
    expect(
      reminderDueAt({ shippedAt: null, deliveredAt: null, kind: "sachet", days, shipToArrivalDays: 3 }),
    ).toBeNull()
  })
})
