import { describe, expect, it } from "vitest"

/**
 * 更正信「一人一封」的名單邏輯。
 *
 * 2026-10-13 的 bug：名單是「一張券一列」，而 10/12 起每人發兩張感謝券
 * （滿1500折100、滿600折50），所以每個收件人都出現兩次、收到兩封一模一樣的信。
 *
 * 這裡把 correctionTargets 裡的分組與蓋章規則抽出來單獨測 —— 真正的函式要打
 * supabase 和 auth.admin，測不動；但會出錯的是分組這一段，不是查詢。
 */

type Row = { id: string; user_id: string; note: string | null }

const MARK = "｜已寄更正信"

/** 與 correctionTargets 相同的規則：濾掉已蓋章的，再以人為單位分組。 */
function groupTargets(rows: Row[], excluded: Set<string> = new Set(), emailOf = (u: string) => `${u}@x.com`) {
  const todo = rows.filter((r) => !(r.note ?? "").includes(MARK))
  const byUser = new Map<string, { userId: string; email: string; coupons: Row[] }>()
  for (const r of todo) {
    const email = emailOf(r.user_id)
    if (excluded.has(email)) continue
    const hit = byUser.get(r.user_id)
    if (hit) { hit.coupons.push(r); continue }
    byUser.set(r.user_id, { userId: r.user_id, email, coupons: [r] })
  }
  return [...byUser.values()]
}

const TWO_COUPONS: Row[] = [
  { id: "c1", user_id: "u1", note: "老朋友感謝券（會員制度更新通知）" },
  { id: "c2", user_id: "u1", note: "老朋友感謝券（會員制度更新通知）" },
  { id: "c3", user_id: "u2", note: "老朋友感謝券（會員制度更新通知）" },
  { id: "c4", user_id: "u2", note: "老朋友感謝券（會員制度更新通知）" },
]

describe("更正信名單：一人一封", () => {
  it("★ 每人兩張券也只寄一封（這就是重複寄兩次的原因）", () => {
    const t = groupTargets(TWO_COUPONS)
    expect(t).toHaveLength(2)
    expect(t.map((x) => x.userId)).toEqual(["u1", "u2"])
  })

  it("★ 一封信要蓋掉這個人名下所有的券，否則下一輪又冒出來", () => {
    const t = groupTargets(TWO_COUPONS)
    expect(t[0].coupons.map((c) => c.id)).toEqual(["c1", "c2"])
  })

  it("★ 蓋過章的券不會再進名單", () => {
    const stamped = TWO_COUPONS.map((r) =>
      r.user_id === "u1" ? { ...r, note: `${r.note}${MARK} 2026-10-13` } : r,
    )
    const t = groupTargets(stamped)
    expect(t.map((x) => x.userId)).toEqual(["u2"])
  })

  it("★ 只蓋到一張券時，那個人還會留在名單上（部分失敗要能重試）", () => {
    const half = TWO_COUPONS.map((r) =>
      r.id === "c1" ? { ...r, note: `${r.note}${MARK} 2026-10-13` } : r,
    )
    const t = groupTargets(half)
    const u1 = t.find((x) => x.userId === "u1")
    expect(u1).toBeDefined()
    expect(u1!.coupons.map((c) => c.id)).toEqual(["c2"])
  })

  it("排除名單以 email 為準，整個人都不寄", () => {
    const t = groupTargets(TWO_COUPONS, new Set(["u1@x.com"]))
    expect(t.map((x) => x.userId)).toEqual(["u2"])
  })

  it("只有一張券的人照舊（舊資料相容）", () => {
    const t = groupTargets([{ id: "c9", user_id: "u9", note: "" }])
    expect(t).toHaveLength(1)
    expect(t[0].coupons).toHaveLength(1)
  })
})

describe("今日已寄封數：數人不數券", () => {
  const uniq = (rows: Array<{ user_id: string }>) => new Set(rows.map((r) => r.user_id)).size

  it("★ 一人兩張券算一封，不是兩封", () => {
    expect(uniq([{ user_id: "u1" }, { user_id: "u1" }])).toBe(1)
  })

  it("兩個人各兩張券算兩封", () => {
    expect(uniq([{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }, { user_id: "u2" }])).toBe(2)
  })

  it("沒有紀錄時是 0", () => {
    expect(uniq([])).toBe(0)
  })
})
