/**
 * 推薦制度的判斷。
 *
 * 這支的每個分支都直接對應到錢：判錯一次就是多發或少發 100 元，而且少發的
 * 那一種客人會寫信來問，多發的那一種不會有人說。
 */
import { describe, it, expect } from "vitest"
import {
  DEFAULT_REFERRAL_SETTINGS,
  checkReferral,
  generateReferralCode,
  normalizeCode,
  sameContact,
} from "../referral"

const base = {
  referrerId: "a",
  refereeId: "b",
  subtotalBeforeDiscount: 650,
  refereeHasPriorOrder: false,
  rewardsThisMonth: 0,
  settings: DEFAULT_REFERRAL_SETTINGS,
}

describe("checkReferral", () => {
  it("折扣前剛好滿 650 就成立", () => {
    expect(checkReferral(base)).toEqual({ ok: true })
  })

  it("差 1 元不成立，但算 deferred（之後還有機會）", () => {
    const r = checkReferral({ ...base, subtotalBeforeDiscount: 649 })
    expect(r).toMatchObject({ ok: false, deferred: true })
  })

  it("★ 自己推自己不成立 —— 換個 email 再註冊就能領 100 元是最好試的洞", () => {
    const r = checkReferral({ ...base, refereeId: "a" })
    expect(r).toMatchObject({ ok: false, deferred: false })
  })

  it("★ 聯絡資料相同視為同一個人", () => {
    const r = checkReferral({ ...base, contactMatches: true })
    expect(r).toMatchObject({ ok: false, deferred: false })
  })

  it("★ 新朋友已經買過就不算推薦 —— 推薦是拉新客，不是補券給老客戶", () => {
    const r = checkReferral({ ...base, refereeHasPriorOrder: true })
    expect(r).toMatchObject({ ok: false, deferred: false })
  })

  it("永久失敗的理由不能標成 deferred，否則每次訂單異動都會重算一次", () => {
    for (const bad of [
      { refereeId: "a" },
      { contactMatches: true },
      { refereeHasPriorOrder: true },
    ]) {
      const r = checkReferral({ ...base, ...bad })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.deferred).toBe(false)
    }
  })

  it("每月預算用完就停，但標成 deferred（不是這位客人的錯）", () => {
    const settings = { ...DEFAULT_REFERRAL_SETTINGS, monthlyBudget: 10 }
    expect(checkReferral({ ...base, settings, rewardsThisMonth: 9 })).toEqual({ ok: true })
    expect(checkReferral({ ...base, settings, rewardsThisMonth: 10 })).toMatchObject({
      ok: false,
      deferred: true,
    })
  })

  it("預算設 0 代表不限", () => {
    const settings = { ...DEFAULT_REFERRAL_SETTINGS, monthlyBudget: 0 }
    expect(checkReferral({ ...base, settings, rewardsThisMonth: 9999 })).toEqual({ ok: true })
  })
})

describe("normalizeCode", () => {
  it("★ 抄錯格式也要認得 —— 碼是從截圖、紙條上抄來的", () => {
    expect(normalizeCode("ab12cd")).toBe("AB12CD")
    expect(normalizeCode(" AB 12-CD ")).toBe("AB12CD")
    expect(normalizeCode("AB_12_CD")).toBe("AB12CD")
  })
  it("長度不對或有奇怪字元就當沒輸入", () => {
    expect(normalizeCode("AB12C")).toBeNull()
    expect(normalizeCode("AB12CDE")).toBeNull()
    expect(normalizeCode("AB12C@")).toBeNull()
    expect(normalizeCode("")).toBeNull()
    expect(normalizeCode(null)).toBeNull()
  })
})

describe("generateReferralCode", () => {
  it("長度固定 6 碼", () => {
    expect(generateReferralCode()).toHaveLength(6)
  })
  it("★ 不含 0/O/1/I/L —— 這組碼要用唸的、用抄的", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateReferralCode()).not.toMatch(/[01OIL]/)
    }
  })
  it("產出的碼一定通得過自己的正規化", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateReferralCode()
      expect(normalizeCode(c)).toBe(c)
    }
  })
})

describe("sameContact", () => {
  it("手機相同就是同一個人，格式不同也算", () => {
    expect(sameContact({ phone: "0912345678" }, { phone: "0912-345-678" })).toBe(true)
  })
  it("地址相同就是同一個人，空白不算差異", () => {
    expect(
      sameContact({ address: "台北市信義區 1 號" }, { address: "台北市信義區1號" }),
    ).toBe(true)
  })
  it("★ 不比姓名 —— 同名同姓太常見，會把真的推薦擋掉", () => {
    expect(sameContact({ phone: "0911111111" }, { phone: "0922222222" })).toBe(false)
  })
  it("資料缺一邊時不當作相同", () => {
    expect(sameContact(null, { phone: "0912345678" })).toBe(false)
    expect(sameContact({ phone: null }, { phone: null })).toBe(false)
    expect(sameContact({ address: "" }, { address: "" })).toBe(false)
  })
})
