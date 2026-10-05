/**
 * 到期自動下架的判斷。真正要守住的是兩道安全邊界：沒填時間的商品永遠不碰，
 * 以及這支程式只會下架、不會把東西弄回架上。
 */
import { describe, it, expect } from "vitest"
import { isExpired } from "../delist-expired-products"

const now = new Date("2026-10-05T00:30:00+08:00")

describe("isExpired", () => {
  it("★ 沒填下架時間的商品永遠不到期 —— 沒設檔期的商品絕不能被排程碰到", () => {
    expect(isExpired({ delist_at: null }, now)).toBe(false)
  })

  it("★ 時間到了就算到期（含剛好那一秒）", () => {
    expect(isExpired({ delist_at: "2026-10-05T00:00:00+08:00" }, now)).toBe(true)
    expect(isExpired({ delist_at: "2026-10-05T00:30:00+08:00" }, now)).toBe(true)
  })

  it("還沒到就不動它", () => {
    expect(isExpired({ delist_at: "2026-10-05T01:00:00+08:00" }, now)).toBe(false)
  })

  it("★ 時間帶時區：「10/4 24:00 台北」不能被當成 UTC 而提早八小時下架", () => {
    // 台北 10/5 00:00 = UTC 10/4 16:00。若誤當 UTC，在台北時間 10/4 16:30 就會到期。
    const taipeiEvening = new Date("2026-10-04T16:30:00+08:00")
    expect(isExpired({ delist_at: "2026-10-05T00:00:00+08:00" }, taipeiEvening)).toBe(false)
  })

  it("時間字串壞掉時不到期，不會因為解析失敗就亂下架", () => {
    expect(isExpired({ delist_at: "不是時間" }, now)).toBe(false)
  })
})
