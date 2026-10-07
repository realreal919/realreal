/**
 * 生日禮金：一年限用一次。
 *
 * 原本 evalBirthdayBonus 只檢查「有沒有生日」和「在不在視窗內」，沒有任何次數
 * 限制 —— campaigns 沒有 max_uses/max_uses_per_user（那是 coupons 的欄位），而
 * 訂單上的 applied_campaign_ids 只是記錄、從來沒被回頭檢查。結果是 31 天的視窗
 * 內每下一筆單就折一次：同心之友回購 5 次就是 5 × 150。
 *
 * 幸好上線至今沒有任何訂單套用過生日禮金，所以政策是在零曝險的情況下定的。
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock("../supabase", () => ({ supabase: { from: fromMock } }))

import { evalBirthdayBonus } from "../campaigns-evaluator"

const CAMPAIGN = {
  id: "camp-bday-50",
  name: "初心之友生日禮金50元",
  type: "birthday_bonus",
  config: {
    discount_method: "fixed",
    discount_value: 50,
    rebate_multiplier: 1,
    birthday_window_days: 31,
  },
} as never

// 2026-03-20，生日 3/18 → 落在視窗內
const NOW = new Date("2026-03-20T04:00:00Z")

function ctx(over: Record<string, unknown> = {}) {
  return {
    user: { id: "u1", tier_id: null, birthday: "1990-03-18", ...over },
    cart: { subtotal: 1000, items: [] },
  } as never
}

/**
 * campaigns 查詢回傳三個生日活動；orders 查詢回傳指定的命中筆數。
 *
 * orders 這一張被兩段程式查：資格檢查的「有沒有完成訂單」（.eq().is().in()）
 * 與一年一次的「視窗內用過沒」（.eq().overlaps().not().gte()），所以同一個
 * 回傳物件要同時認得兩條鏈。
 */
function mockDb(orderCount: number, opts: { priorOrders?: number; birthdayChangedAt?: string | null } = {}) {
  const priorOrders = opts.priorOrders ?? 1
  fromMock.mockImplementation((table: string) => {
    if (table === "campaigns") {
      return {
        select: () => ({
          eq: () => Promise.resolve({
            data: [{ id: "camp-bday-50" }, { id: "camp-bday-100" }, { id: "camp-bday-150" }],
            error: null,
          }),
        }),
      }
    }
    if (table === "user_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { birthday_changed_at: opts.birthdayChangedAt ?? null },
              error: null,
            }),
          }),
        }),
      }
    }
    return {
      select: () => ({
        eq: () => ({
          // 資格檢查：有沒有完成訂單
          is: () => ({
            in: () => Promise.resolve({ count: priorOrders, error: null }),
          }),
          // 一年一次：這個生日視窗內用過沒
          overlaps: () => ({
            not: () => ({
              gte: () => Promise.resolve({ count: orderCount, error: null }),
            }),
          }),
        }),
      }),
    }
  })
}

beforeEach(() => vi.clearAllMocks())

describe("生日禮金 — 一年限用一次", () => {
  it("★ 視窗內第一次：折抵 50", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(CAMPAIGN, ctx(), NOW)
    expect(r.applied).toBe(true)
    expect(r.discount_amount).toBe(50)
  })

  it("★ 同一個生日視窗內第二次：不再折抵", async () => {
    mockDb(1)
    const r = await evalBirthdayBonus(CAMPAIGN, ctx(), NOW)
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("一年限用一次")
  })

  it("★ 比對的是 birthday_bonus 全類型，不是單一活動 —— 視窗中途升等不能再領一次", async () => {
    // 之前那筆用的是知心之友的活動 (camp-bday-100)，現在評估初心之友的
    // camp-bday-50，一樣要被擋下來。
    mockDb(1)
    const r = await evalBirthdayBonus(CAMPAIGN, ctx(), NOW)
    expect(r.applied).toBe(false)
  })

  it("★ 查詢失敗時放行 —— 寧可偶爾多送，也不要在結帳頁默默拿掉客人的折扣", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [{ id: "camp-bday-50" }], error: null }) }) }
      }
      if (table === "user_profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            is: () => ({ in: () => Promise.resolve({ count: 1, error: null }) }),
            overlaps: () => ({
              not: () => ({ gte: () => Promise.resolve({ count: null, error: { message: "boom" } }) }),
            }),
          }),
        }),
      }
    })
    const r = await evalBirthdayBonus(CAMPAIGN, ctx(), NOW)
    expect(r.applied).toBe(true)
  })

  it("沒有生日資料仍然直接跳過，不會去查資料庫", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(CAMPAIGN, ctx({ birthday: null }), NOW)
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("無生日資料")
    expect(fromMock).not.toHaveBeenCalled()
  })

  it("不在視窗內也不會去查資料庫", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(CAMPAIGN, ctx(), new Date("2026-08-01T04:00:00Z"))
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("window")
    expect(fromMock).not.toHaveBeenCalled()
  })
})

/**
 * 生日當月（calendar_month）。
 *
 * 舊的天數算法看起來像「生日前後 31 天」，實際上是「生日前 1 天到生日後 31
 * 天」—— 總共 33 天，而且生日之前幾乎用不到。5/21 生日的人整個五月上旬都不能
 * 用，卻可以用到 6/21，既難解釋也不像生日禮金。
 *
 * 生日當月只比月份：5/21 生日 → 整個五月，5/1 就能用。
 */
describe("生日禮金 — 生日當月", () => {
  const MONTH_CAMPAIGN = {
    id: "camp-bday-50",
    name: "初心之友生日禮金50元",
    type: "birthday_bonus",
    config: {
      discount_method: "fixed",
      discount_value: 50,
      birthday_window_mode: "calendar_month",
    },
  } as never

  function at(iso: string) {
    return new Date(iso)
  }

  it("★ 5/21 生日：5/1 就能用（舊算法要等到 5/20）", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(MONTH_CAMPAIGN, ctx({ birthday: "1990-05-21" }), at("2026-05-01T00:30:00Z"))
    expect(r.applied).toBe(true)
    expect(r.discount_amount).toBe(50)
  })

  it("★ 5/21 生日：5/31 仍可用（當月最後一天）", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(MONTH_CAMPAIGN, ctx({ birthday: "1990-05-21" }), at("2026-05-31T15:00:00Z"))
    expect(r.applied).toBe(true)
  })

  it("★ 5/21 生日：6/1 不能用（舊算法會一路開到 6/21）", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(MONTH_CAMPAIGN, ctx({ birthday: "1990-05-21" }), at("2026-06-01T04:00:00Z"))
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("不在生日當月")
  })

  it("★ 4/30 不能用 —— 生日前一個月不算數", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(MONTH_CAMPAIGN, ctx({ birthday: "1990-05-21" }), at("2026-04-30T04:00:00Z"))
    expect(r.applied).toBe(false)
  })

  it("★ 用台北時間判斷月份：台北 5/1 00:30（UTC 仍是 4/30 16:30）算五月", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(MONTH_CAMPAIGN, ctx({ birthday: "1990-05-21" }), at("2026-04-30T16:30:00Z"))
    expect(r.applied).toBe(true)
  })

  it("★ 台北 6/1 00:30（UTC 5/31 16:30）已經不算五月", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(MONTH_CAMPAIGN, ctx({ birthday: "1990-05-21" }), at("2026-05-31T16:30:00Z"))
    expect(r.applied).toBe(false)
  })

  it("當月模式不需要 birthday_window_days，缺了也照常運作", async () => {
    mockDb(0)
    const r = await evalBirthdayBonus(MONTH_CAMPAIGN, ctx({ birthday: "1990-05-21" }), at("2026-05-10T04:00:00Z"))
    expect(r.applied).toBe(true)
  })

  it("★ 當月已經用過就不再折（一年一次仍然成立）", async () => {
    mockDb(1)
    const r = await evalBirthdayBonus(MONTH_CAMPAIGN, ctx({ birthday: "1990-05-21" }), at("2026-05-10T04:00:00Z"))
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("一年限用一次")
  })
})

/**
 * 生日禮的資格條件（2026-10-08）。
 *
 * 在這之前唯一的條件是「生日在當月」，所以新帳號註冊當下把生日填成本月，
 * 第一筆訂單就能折 50，再加上首購折 50，開箱就是 100 元。鎖住生日不能改
 * 擋不到這條 —— 註冊時填的那一次本來就是合法的。
 */
describe("生日禮金 — 資格條件", () => {
  it("★ 註冊未滿 30 天不給 —— 擋掉「註冊當下填本月生日就領」", async () => {
    mockDb(0)
    const recent = new Date(NOW.getTime() - 5 * 86_400_000).toISOString()
    const r = await evalBirthdayBonus(CAMPAIGN, ctx({ created_at: recent }), NOW)
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("註冊未滿 30 天")
  })

  it("註冊滿 30 天就放行", async () => {
    mockDb(0)
    const old = new Date(NOW.getTime() - 40 * 86_400_000).toISOString()
    const r = await evalBirthdayBonus(CAMPAIGN, ctx({ created_at: old }), NOW)
    expect(r.applied).toBe(true)
  })

  it("★ 還沒有完成訂單不給", async () => {
    mockDb(0, { priorOrders: 0 })
    const old = new Date(NOW.getTime() - 40 * 86_400_000).toISOString()
    const r = await evalBirthdayBonus(CAMPAIGN, ctx({ created_at: old }), NOW)
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("尚無完成訂單")
  })

  it("★ 生日在本月才設定的不給 —— 客服改完當月不該馬上領得到", async () => {
    mockDb(0, { birthdayChangedAt: NOW.toISOString() })
    const old = new Date(NOW.getTime() - 40 * 86_400_000).toISOString()
    const r = await evalBirthdayBonus(CAMPAIGN, ctx({ created_at: old }), NOW)
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("本月才設定")
  })

  it("上個月設定的就可以", async () => {
    mockDb(0, { birthdayChangedAt: "2026-02-10T00:00:00Z" })
    const old = new Date(NOW.getTime() - 40 * 86_400_000).toISOString()
    const r = await evalBirthdayBonus(CAMPAIGN, ctx({ created_at: old }), NOW)
    expect(r.applied).toBe(true)
  })

  it("★ 查不到註冊日期時，仍然要檢查訂單與設定月份，不是整段放行", async () => {
    mockDb(0, { priorOrders: 0 })
    const r = await evalBirthdayBonus(CAMPAIGN, ctx(), NOW)
    expect(r.applied).toBe(false)
    expect(r.reason).toContain("尚無完成訂單")
  })
})
