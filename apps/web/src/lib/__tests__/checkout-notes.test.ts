import { describe, expect, it } from "vitest"

/**
 * 回到結帳頁時「備註要不要帶回來」的規則。
 *
 * 真正的 state 流程在 checkout/page.tsx 的 restore effect 裡，這裡照
 * cvs-memory.test.ts 的做法把判斷條件抽出來單獨驗。
 *
 * 為什麼要有這條規則：姓名、電話、地址、上次取貨門市從 2026-10-17 起都會自動
 * 帶回來，備註是唯一不會的欄位。客人回上一步看到表單是滿的就按下一步，備註就被
 * 蓋成空的 —— 10000393、10000404 兩筆任選口味的訂單都是這樣來的。
 */
const NOTES_RESTORE_TTL_MS = 2 * 60 * 60_000

export function restoredNote(args: {
  current: string
  saved?: string
  savedAt?: number
  now: number
}): string {
  if (args.current) return args.current
  if (!args.saved) return args.current
  const stale =
    typeof args.savedAt === "number" && args.now - args.savedAt >= NOTES_RESTORE_TTL_MS
  return stale ? args.current : args.saved
}

const NOW = 1_800_000_000_000
const saved = "草莓2、芝麻2"

describe("回上一步的備註", () => {
  it("★ 備註空的 → 把上一輪填的帶回來", () => {
    expect(restoredNote({ current: "", saved, savedAt: NOW - 60_000, now: NOW })).toBe(saved)
  })

  it("★ 客人已經重打過 → 不覆蓋", () => {
    expect(restoredNote({ current: "改成可可3", saved, savedAt: NOW - 60_000, now: NOW }))
      .toBe("改成可可3")
  })

  it("★ 放了兩小時以上的舊結帳內容 → 不帶，免得上一次沒買成的口味跑到新訂單", () => {
    expect(restoredNote({ current: "", saved, savedAt: NOW - 3 * 60 * 60_000, now: NOW })).toBe("")
  })

  it("沒有 savedAt（修正前存下來的）→ 當作還新的，照帶", () => {
    expect(restoredNote({ current: "", saved, now: NOW })).toBe(saved)
  })

  it("上一輪本來就沒寫備註 → 維持空的", () => {
    expect(restoredNote({ current: "", savedAt: NOW - 60_000, now: NOW })).toBe("")
  })
})
