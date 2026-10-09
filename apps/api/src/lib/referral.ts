/**
 * 推薦制度：介紹朋友，雙方各得 50 元。
 *
 * 規則（2026-10-09 店主定案）：
 *   - 新朋友的第一張單「折扣前」滿 650 元才算成立
 *   - 新朋友得 50 元購物金（下一單才能用）
 *   - 推薦人得 50 元公益存款回饋金（points_ledger，1 點 = NT$1）
 *
 * 為什麼門檻看「折扣前」：看折後的話，兩邊的獎勵會跟著折扣活動浮動 ——
 * 同樣買 700 元的東西，用了優惠碼就不算推薦成功，客人問起來沒有道理可講。
 *
 * 為什麼新朋友的購物金是「下一單才能用」：當下就折的話會跟首購折 50 疊在
 * 同一張單上，650 元的單實收 550。發券到帳號裡，順便把人推向第二次購買。
 */

export type ReferralSettings = {
  /** 折扣前的最低訂單金額 */
  minOrder: number
  /** 新朋友拿到的購物金面額 */
  refereeReward: number
  /** 推薦人拿到的公益存款點數 */
  referrerPoints: number
  /** 每月最多發出幾組獎勵，0 代表不限 */
  monthlyBudget: number
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  minOrder: 650,
  refereeReward: 50,
  referrerPoints: 50,
  monthlyBudget: 0,
}

/** 推薦碼的字元集。去掉 0/O/1/I/L —— 這組碼是要用唸的、用抄的。 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
export const CODE_LENGTH = 6

export function generateReferralCode(random: () => number = Math.random): string {
  let out = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return out
}

/**
 * 使用者輸入的推薦碼正規化。
 *
 * 大小寫、前後空白、中間的空格與破折號都要吃掉 —— 碼是從對話框、截圖、
 * 手寫紙條上抄過來的，抄成 "ab 12-cd" 很正常，因為一個空格就說「查無此碼」
 * 只會讓客人以為推薦人騙他。
 */
export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.toUpperCase().replace(/[\s\-_]/g, "")
  if (cleaned.length !== CODE_LENGTH) return null
  if (!/^[0-9A-Z]+$/.test(cleaned)) return null
  return cleaned
}

export type ReferralCheckInput = {
  referrerId: string | null | undefined
  refereeId: string | null | undefined
  /** 折扣前小計（元） */
  subtotalBeforeDiscount: number
  /** 新朋友在這張單之前有沒有買過 */
  refereeHasPriorOrder: boolean
  /** 這個月已經發出幾組獎勵 */
  rewardsThisMonth: number
  settings: ReferralSettings
  /** 兩邊的聯絡資料相同就是同一個人（手機、收件地址） */
  contactMatches?: boolean
}

export type ReferralCheck =
  | { ok: true }
  | { ok: false; reason: string; /** deferred = 條件還有機會成立，不是永久失敗 */ deferred: boolean }

/**
 * 這張訂單算不算推薦成功。
 *
 * 「還差一點」和「永遠不可能」要分開 —— 前者（金額不足）之後可能補得回來，
 * 後者（自己推自己、已經買過）要直接關掉，不然每次訂單狀態變動都會重算一次。
 */
export function checkReferral(input: ReferralCheckInput): ReferralCheck {
  const { referrerId, refereeId, settings } = input

  if (!referrerId || !refereeId) {
    return { ok: false, reason: "推薦人或新朋友不存在", deferred: false }
  }
  // 自己推自己：換一個 email 再註冊一次就能領 100 元，這是最容易被試出來的洞
  if (referrerId === refereeId) {
    return { ok: false, reason: "不能推薦自己", deferred: false }
  }
  if (input.contactMatches) {
    return { ok: false, reason: "推薦人與新朋友的聯絡資料相同", deferred: false }
  }
  // 推薦是拉新客，不是給老客戶補一張券
  if (input.refereeHasPriorOrder) {
    return { ok: false, reason: "新朋友不是第一次購買", deferred: false }
  }
  if (input.subtotalBeforeDiscount < settings.minOrder) {
    return {
      ok: false,
      reason: `折扣前未滿 ${settings.minOrder} 元`,
      deferred: true,
    }
  }
  if (settings.monthlyBudget > 0 && input.rewardsThisMonth >= settings.monthlyBudget) {
    // 預算用完不是這位客人的錯，留著下個月還有機會
    return { ok: false, reason: "本月推薦獎勵已達上限", deferred: true }
  }
  return { ok: true }
}

/**
 * 兩筆聯絡資料是不是同一個人。
 *
 * 只比手機與收件地址，不比姓名 —— 同名同姓太常見，拿姓名當判準會把真的推薦
 * 擋掉。手機去掉所有非數字再比，地址去掉空白與全半形差異。
 */
export function sameContact(
  a: { phone?: string | null; address?: string | null } | null | undefined,
  b: { phone?: string | null; address?: string | null } | null | undefined,
): boolean {
  if (!a || !b) return false
  const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")
  const addr = (v: string | null | undefined) =>
    (v ?? "").replace(/\s/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )

  const pa = digits(a.phone)
  const pb = digits(b.phone)
  if (pa && pa === pb) return true

  const aa = addr(a.address)
  const ab = addr(b.address)
  return !!aa && aa === ab
}
