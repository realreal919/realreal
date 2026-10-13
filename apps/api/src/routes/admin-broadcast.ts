import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { getSetting } from "../lib/settings"
import { generateCouponCode } from "../lib/repurchase-coupon"
import { ensureReferralCode, loadReferralSettings } from "../lib/referral-service"
import { renderAndSendEmail } from "../workers/email-sender"
import { sendEmail } from "../lib/email"
import { ORDER_DELAY_SUBJECT, renderOrderDelayNotice } from "../emails/OrderDelayNotice"

export const adminBroadcastRouter = Router()

adminBroadcastRouter.use(requireAuth, requireAdmin)

/**
 * 隨通知信發的感謝券。一次兩張，面額不同。
 *
 * 兩張的理由：滿 1500 對輕量購買的人太遠，只給那一張等於只對大單客有意義。
 * 滿 600 那張是給其他人的。資料庫的唯一索引是 (user_id, amount)，所以同一個
 * 面額一人仍然只會有一張。
 */
const THANKS_COUPONS = [
  { amount: 100, minOrder: 1500, prefix: "TK" },
  { amount: 50, minOrder: 600, prefix: "TS" },
] as const
const THANKS_VALID_DAYS = 60

type Recipient = { userId: string; email: string; displayName: string }

/**
 * 一天最多寄幾封廣播信。
 *
 * Resend 免費方案每日 100 封，而這 100 封是所有信共用的。交易信必須優先 ——
 * 行銷信把額度吃光的話，客人付完款收不到確認信、註冊收不到驗證信。
 *
 * 60 是算出來的：近 30 天單日訂單最多 10 筆，每筆會觸發付款成功、管理員
 * 通知、出貨通知約 3 封；單日新註冊最多 6 人。最忙的一天大約要 40 封，
 * 所以留 40 封。升級付費方案後可以在後台把這個數字調高。
 */
/**
 * 「已寄過更正信」記在感謝券的 note 上，後面接台灣日期。
 *
 * 廣播沒有訂單可挂，reminders.source_order_id 又是 not null，而這 151 個人
 * 每人本來就有一張感謝券 —— 與其為了一次性的更正另外建表（又要請店主跑一次
 * SQL），不如在既有的那一列上做記號。帶日期是為了讓每日用量數得到它。
 */
const CORRECTION_MARK = "｜已寄更正信"

const DEFAULT_DAILY_SEND_CAP = 60

async function dailySendCap(): Promise<number> {
  const raw = await getSetting("broadcast.daily_cap")
  if (raw == null || raw.trim() === "") return DEFAULT_DAILY_SEND_CAP
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_SEND_CAP
}

/** 今天（台灣時間）已經發出幾封廣播信。感謝券的建立時間就是記錄。 */
function twToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date())
}

/**
 * 今天（台灣時間）已經發出幾封廣播信。
 *
 * 兩種都要算：通知信（會建一張感謝券）與更正信（不建券，只在券的
 * note 上記日期）。只數券的話，寄完 60 封更正信後計數器還是 0，
 * 系統會放你再寄 60 封通知信 —— 加起來超過寄送服務的每日上限，
 * 而被撠掉的會是排在後面的訂單確認信。
 */
/**
 * 今天寄了幾封（制度更新信 + 更正信）。
 *
 * 數的是**人**不是券。2026-10-12 起每人發兩張感謝券，而原本是用券的筆數當封數，
 * 於是一封信被算成兩封 —— 每日上限 60 封會在真正寄出 30 封時就喊停。
 * 更正信在 2026-10-13 改成一人一封、一次蓋掉名下所有券之後也是同樣情形。
 *
 * PostgREST 沒有 count(distinct)，所以把 user_id 撈回來自己去重。持券的人只有
 * 一百多個，撈全部沒有負擔。
 */
async function sentToday(): Promise<number> {
  const today = twToday()
  const start = new Date(`${today}T00:00:00+08:00`)
  const [{ data: issued }, { data: corrected }] = await Promise.all([
    supabase
      .from("member_coupons")
      .select("user_id")
      .eq("type", "thanks")
      .gte("created_at", start.toISOString()),
    supabase
      .from("member_coupons")
      .select("user_id")
      .eq("type", "thanks")
      .like("note", `%${CORRECTION_MARK} ${today}%`),
  ])
  const uniq = (rows: Array<{ user_id: string }> | null) =>
    new Set((rows ?? []).map((r) => r.user_id)).size
  // 兩種信分開算：同一個人今天可能既收到制度更新信、又收到更正信，那就是兩封。
  return uniq(issued as Array<{ user_id: string }> | null)
    + uniq(corrected as Array<{ user_id: string }> | null)
}

/**
 * 會員制度更新通知信的收件名單。
 *
 * 寄給「有帳號、沒退訂行銷、還沒拿過感謝券」的人。不限有沒有買過 ——
 * 這封信講的是制度，註冊了就該知道。
 */
/**
 * 店主自己的帳號，行銷信一律不寄。
 *
 * 真正生效的是 user_profiles.marketing_opt_out —— 那一個欄位四個寄信的地方都有
 * 檢查（制度更新信、更正信、召回名單、回饋信與回購提醒），2026-10-13 已經把
 * warmflying@gmail.com 設成 true。
 *
 * 這張清單是第二道防線：帳號的退訂狀態可能被後台改回來，或被測試流程重設，
 * 而「這是店主本人的帳號」這件事不會變。兩道都在，才不會因為一次誤觸就把
 * 行銷信寄給自己。
 *
 * 不含交易信（訂單確認、出貨通知）—— 那些本來就該收得到。
 */
const OWNER_ACCOUNTS = new Set(["warmflying@gmail.com"])

export function isExcludedFromMembershipUpdate(email: string): boolean {
  return OWNER_ACCOUNTS.has(email.trim().toLowerCase())
}

async function buildRecipients(): Promise<{ list: Recipient[]; alreadySent: number }> {
  const { data: profiles, error } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, marketing_opt_out")
  if (error) throw new Error(error.message)

  const rows = (profiles ?? []) as Array<{
    user_id: string
    display_name: string | null
    marketing_opt_out: boolean | null
  }>
  const eligible = rows.filter((r) => !r.marketing_opt_out)

  // 已經拿過感謝券 = 已經收過這封信。券本身就是憑據，不另外建一張寄送紀錄表。
  const { data: sentRows } = await supabase
    .from("member_coupons")
    .select("user_id")
    .eq("type", "thanks")
  const sent = new Set(((sentRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))

  // Email 在 auth.users，一次 listUsers 撈完
  const emails = new Map<string, string>()
  const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of authList?.users ?? []) if (u.email) emails.set(u.id, u.email)

  const list: Recipient[] = []
  for (const r of eligible) {
    if (sent.has(r.user_id)) continue
    const email = emails.get(r.user_id)
    if (!email) continue
    if (isExcludedFromMembershipUpdate(email)) continue
    list.push({ userId: r.user_id, email, displayName: r.display_name ?? "" })
  }
  return { list, alreadySent: sent.size }
}

/**
 * 補寄的對象：這些 email 對應的會員，而且已經有感謝券。
 *
 * 寄送服務超額時會回 200 卻不投遞，所以會出現「有券、沒收到信」的人。
 * 他們已經不在待寄名單上（券就是寄過的憑據），所以要一條別的路。
 */
async function resendTargets(emails: string[]): Promise<Recipient[]> {
  const wanted = new Set(emails.map((e) => e.toLowerCase()))
  const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const byId = new Map<string, string>()
  for (const u of authList?.users ?? []) {
    if (u.email && wanted.has(u.email.toLowerCase())) byId.set(u.id, u.email)
  }
  if (byId.size === 0) return []

  const ids = [...byId.keys()]
  const [{ data: coupons }, { data: profiles }] = await Promise.all([
    supabase.from("member_coupons").select("user_id").eq("type", "thanks").in("user_id", ids),
    supabase.from("user_profiles").select("user_id, display_name").in("user_id", ids),
  ])
  const hasCoupon = new Set(((coupons ?? []) as Array<{ user_id: string }>).map((c) => c.user_id))
  const names = new Map(
    ((profiles ?? []) as Array<{ user_id: string; display_name: string | null }>).map((p) => [
      p.user_id,
      p.display_name ?? "",
    ]),
  )
  return ids
    .filter((id) => hasCoupon.has(id))
    .map((id) => ({ userId: id, email: byId.get(id) as string, displayName: names.get(id) ?? "" }))
}

type IssuedCoupon = { amount: number; minOrder: number; code: string }

/** 發一張指定面額的感謝券。已經有同面額的就回 null。 */
async function issueOneThanksCoupon(
  userId: string,
  spec: (typeof THANKS_COUPONS)[number],
  validUntil: Date,
): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCouponCode(spec.prefix)
    const { error } = await supabase.from("member_coupons").insert({
      user_id: userId,
      type: "thanks",
      amount: spec.amount,
      min_order: spec.minOrder,
      code,
      valid_until: validUntil.toISOString(),
      note: "老朋友感謝券（會員制度更新通知）",
    })
    if (!error) return code
    const msg = String(error.message)
    // (user_id, amount) 的唯一索引撞到 = 這個面額已經發過，不是碼撞號
    if (msg.includes("idx_member_coupons_thanks_once")) return null
    if (!msg.includes("duplicate")) {
      console.warn(`[broadcast] 感謝券建立失敗 user=${userId} amount=${spec.amount}:`, error)
      return null
    }
  }
  return null
}

/**
 * 發齊兩張感謝券。
 *
 * 任一張發不出來就回 null，呼叫端會跳過不寄 —— 信上兩張券的碼都要印出來，
 * 少一張的信寄出去會讓客人以為系統出錯。已經插進去的那張留著，下一批會補齊。
 */
async function issueThanksCoupons(
  userId: string,
  validUntil: Date,
): Promise<IssuedCoupon[] | null> {
  const out: IssuedCoupon[] = []
  for (const spec of THANKS_COUPONS) {
    const code = await issueOneThanksCoupon(userId, spec, validUntil)
    if (!code) return null
    out.push({ amount: spec.amount, minOrder: spec.minOrder, code })
  }
  return out
}

// GET /admin/broadcast/membership-update —— 試算，不寄任何東西
adminBroadcastRouter.get("/membership-update", async (_req, res) => {
  try {
    const { list, alreadySent } = await buildRecipients()
    const [today, cap] = await Promise.all([sentToday(), dailySendCap()])
    res.json({
      pending: list.length,
      already_sent: alreadySent,
      sent_today: today,
      daily_cap: cap,
      remaining_today: Math.max(0, cap - today),
      coupons: THANKS_COUPONS.map((c) => ({ amount: c.amount, min_order: c.minOrder })),
      coupon_valid_days: THANKS_VALID_DAYS,
      // 名單前 10 筆給管理者確認長相，不把 227 個 email 全倒出來
      sample: list.slice(0, 10).map((r) => ({ email: r.email, name: r.displayName })),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "名單產生失敗" })
  }
})

const sendSchema = z.object({
  /** 只寄給這些 email（測試用）。給了就忽略名單。 */
  only: z.array(z.string().email()).max(20).optional(),
  /** 這一批最多寄幾封。分批寄，寄件聲譽比較穩。 */
  limit: z.number().int().min(1).max(500).optional(),
  /**
   * 補寄。搭配 only 使用：對「已經有券、但沒收到信」的人重寄一次。
   * 會沿用他原本那張券，不發第二張。
   */
  resend: z.boolean().optional(),
  /** 必須明確帶 true 才會真的寄。 */
  confirm: z.literal(true),
})

/**
 * POST /admin/broadcast/membership-update —— 真的寄。
 *
 * 一定要帶 confirm:true，而且預設一批 50 封 —— 這是一次性廣播，寄出去收不回來。
 * 先發券再寄信：券的唯一索引是唯一能擋「按兩次就寄兩封」的東西。
 */
adminBroadcastRouter.post("/membership-update", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "請確認寄送參數（需要 confirm: true）" })
    return
  }
  const { only, limit = 50, resend } = parsed.data

  if (resend && !only) {
    res.status(400).json({ error: "補寄必須指定收件人（only）" })
    return
  }

  try {
    // 每日額度擋在我們這邊。寄送服務超額時會照收請求卻不投遞，
    // 程式看起來全部成功、券照發，而收件人什麼都沒收到。
    const [used, cap] = await Promise.all([sentToday(), dailySendCap()])
    const budget = Math.max(0, cap - used)
    if (budget === 0) {
      res.status(429).json({
        error: `今日寄送額度已用完（已寄 ${used} 封，上限 ${cap}），明天再繼續。`,
        sent_today: used,
      })
      return
    }

    const { list } = await buildRecipients()
    let targets: Recipient[]
    if (resend) {
      targets = await resendTargets(only ?? [])
      if (targets.length === 0) {
        res.status(400).json({ error: "這些 email 沒有找到已發出的感謝券，沒有可補寄的對象" })
        return
      }
    } else if (only) {
      targets = list.filter((r) => only.includes(r.email.toLowerCase()))
      if (targets.length === 0) {
        res.status(400).json({ error: "指定的 email 不在待寄名單上（可能已經寄過或已退訂）" })
        return
      }
    } else {
      targets = list.slice(0, limit)
    }

    if (targets.length > budget) targets = targets.slice(0, budget)

    const rebate = Number(await getSetting("membership.rebate_percent")) || 3
    const referral = await loadReferralSettings()

    let sent = 0
    const failed: string[] = []
    for (const r of targets) {
      let coupons: IssuedCoupon[] | null
      let validUntil: Date
      if (resend) {
        // 補寄沿用原本那幾張券，不再發新的 —— 人沒收到信，不代表券沒發
        const { data: existing } = await supabase
          .from("member_coupons")
          .select("code, amount, min_order, valid_until")
          .eq("user_id", r.userId)
          .eq("type", "thanks")
          .order("amount", { ascending: false })
        const rows = (existing ?? []) as Array<{
          code: string | null
          amount: number | string
          min_order: number | string | null
          valid_until: string
        }>
        coupons = rows.length
          ? rows
              .filter((x) => x.code)
              .map((x) => ({
                amount: Number(x.amount),
                minOrder: Number(x.min_order) || 0,
                code: x.code as string,
              }))
          : null
        validUntil = rows[0] ? new Date(rows[0].valid_until) : new Date()
      } else {
        validUntil = new Date()
        validUntil.setDate(validUntil.getDate() + THANKS_VALID_DAYS)
        // 先發券。發不齊就不寄 —— 信上兩張券的碼都要印，而且發出去了
        // 也代表這個人已經寄過。
        coupons = await issueThanksCoupons(r.userId, validUntil)
      }
      if (!coupons || coupons.length === 0) {
        failed.push(r.email)
        continue
      }

      try {
        const referralCode = await ensureReferralCode(r.userId).catch(() => null)
        await renderAndSendEmail({
          template: "membership-update",
          to: r.email,
          data: {
            customerName: r.displayName,
            coupons,
            validUntil: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(
              validUntil,
            ),
            rebatePercent: rebate,
            referralMinOrder: referral.minOrder,
            referralReward: referral.refereeReward,
            referralCode,
          },
        })
        sent++
      } catch (err) {
        // 券是「這個人寄過了」的憑據，信沒寄成就要把它收回來，
        // 否則這個人永遠不會再被名單挑到 —— 手上有券、卻沒收過信，
        // 而且沒有任何地方看得出來。收回之後下一批會自動重試。
        console.error(`[broadcast] 寄信失敗 ${r.email}:`, err)
        // 補寄失敗不動券 —— 那張券本來就存在，跟這次寄不寄得成無關
        if (!resend) {
          await supabase
            .from("member_coupons")
            .delete()
            .eq("user_id", r.userId)
            .eq("type", "thanks")
            .eq("status", "active")
        }
        failed.push(r.email)
      }

      // 寄送服務有每秒請求上限，一批幾十封連發會被擋。慲一點沒有損失。
      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    const { list: rest } = await buildRecipients()
    const after = await sentToday()
    res.json({
      sent,
      failed,
      remaining: rest.length,
      sent_today: after,
      remaining_today: Math.max(0, cap - after),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "寄送失敗" })
  }
})

// ---------------------------------------------------------------------------
// 更正信：2026-10-09 寄出的那批，推薦回饋金額印成 0 元
// ---------------------------------------------------------------------------

/** 原信寄出的日期，印在更正信裡。 */
const CORRECTION_ORIGINAL_SENT_ON = "10/9"

/**
 * 更正信的收件人。
 *
 * coupons 是「這個人所有還沒標記過的感謝券」—— 複數，不是一張。
 * 2026-10-12 起每人發兩張券（滿1500折100、滿600折50），而這份名單原本是
 * 「一張券一列」，於是每個人都出現兩次、收到兩封一模一樣的更正信。
 * 改成一人一列，寄完把他名下所有未標記的券一起蓋章，才不會下一輪又冒出來。
 */
type CorrectionTarget = Recipient & { coupons: Array<{ id: string; note: string }> }

async function correctionTargets(exclude: string[] = []): Promise<{
  pending: CorrectionTarget[]
  alreadySent: number
}> {
  const { data: coupons } = await supabase
    .from("member_coupons")
    .select("id, user_id, note")
    .eq("type", "thanks")
    .order("created_at", { ascending: true })
  const rows = (coupons ?? []) as Array<{ id: string; user_id: string; note: string | null }>

  const alreadySent = rows.filter((r) => (r.note ?? "").includes(CORRECTION_MARK)).length
  const todo = rows.filter((r) => !(r.note ?? "").includes(CORRECTION_MARK))
  if (todo.length === 0) return { pending: [], alreadySent }

  const emails = new Map<string, string>()
  const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of authList?.users ?? []) if (u.email) emails.set(u.id, u.email)

  const ids = todo.map((r) => r.user_id)
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, marketing_opt_out")
    .in("user_id", ids)
  const prof = new Map(
    ((profiles ?? []) as Array<{
      user_id: string
      display_name: string | null
      marketing_opt_out: boolean | null
    }>).map((p) => [p.user_id, p]),
  )

  const skip = new Set(exclude.map((e) => e.toLowerCase().trim()))
  // 一人一列：同一個人名下的多張券併成一筆，否則兩張券 = 兩封信。
  const byUser = new Map<string, CorrectionTarget>()
  for (const r of todo) {
    const email = emails.get(r.user_id)
    if (!email || skip.has(email.toLowerCase())) continue
    if (prof.get(r.user_id)?.marketing_opt_out) continue
    const existing = byUser.get(r.user_id)
    if (existing) {
      existing.coupons.push({ id: r.id, note: r.note ?? "" })
      continue
    }
    byUser.set(r.user_id, {
      userId: r.user_id,
      email,
      displayName: prof.get(r.user_id)?.display_name ?? "",
      coupons: [{ id: r.id, note: r.note ?? "" }],
    })
  }
  return { pending: [...byUser.values()], alreadySent }
}

const correctionQuery = z.object({ exclude: z.array(z.string()).max(50).optional() })

// GET /admin/broadcast/correction —— 試算
adminBroadcastRouter.get("/correction", async (req, res) => {
  try {
    const exclude =
      typeof req.query.exclude === "string" ? req.query.exclude.split(/[\s,;]+/).filter(Boolean) : []
    const [{ pending, alreadySent }, today, cap] = await Promise.all([
      correctionTargets(exclude),
      sentToday(),
      dailySendCap(),
    ])
    res.json({
      pending: pending.length,
      already_sent: alreadySent,
      excluded: exclude.length,
      sent_today: today,
      daily_cap: cap,
      remaining_today: Math.max(0, cap - today),
      sample: pending.slice(0, 10).map((p) => ({ email: p.email, name: p.displayName })),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "名單產生失敗" })
  }
})

const correctionSendSchema = correctionQuery.extend({
  limit: z.number().int().min(1).max(500).optional(),
  confirm: z.literal(true),
})

// POST /admin/broadcast/correction —— 真的寄
adminBroadcastRouter.post("/correction", async (req, res) => {
  const parsed = correctionSendSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "請確認寄送參數（需要 confirm: true）" })
    return
  }
  const { limit = 60, exclude = [] } = parsed.data

  try {
    const [used, cap] = await Promise.all([sentToday(), dailySendCap()])
    const budget = Math.max(0, cap - used)
    if (budget === 0) {
      res.status(429).json({ error: `今日寄送額度已用完（上限 ${cap}），明天再繼續。` })
      return
    }

    const { pending } = await correctionTargets(exclude)
    const targets = pending.slice(0, Math.min(limit, budget))
    const referral = await loadReferralSettings()

    let sent = 0
    const failed: string[] = []
    for (const t of targets) {
      try {
        const referralCode = await ensureReferralCode(t.userId).catch(() => null)
        await renderAndSendEmail({
          template: "membership-update-correction",
          to: t.email,
          data: {
            customerName: t.displayName,
            originalSentOn: CORRECTION_ORIGINAL_SENT_ON,
            referralMinOrder: referral.minOrder,
            referralReward: referral.refereeReward,
            referralCode,
          },
        })
        // 寄成功才記號。順序跟感謝券那邊相反是刻意的：這封沒有要發任何東西，
        // 重寄的代價只是再收一封，比「寄失敗卻被記成已寄」小得多。
        // 這個人名下所有未標記的券都要蓋章，不然下一輪他又會出現在名單上。
        const stamp = `${CORRECTION_MARK} ${twToday()}`
        for (const c of t.coupons) {
          await supabase
            .from("member_coupons")
            .update({ note: `${c.note}${stamp}` })
            .eq("id", c.id)
        }
        sent++
      } catch (err) {
        console.error(`[broadcast] 更正信寄送失敗 ${t.email}:`, err)
        failed.push(t.email)
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }

    const [{ pending: rest }, after] = await Promise.all([correctionTargets(exclude), sentToday()])
    res.json({
      sent,
      failed,
      remaining: rest.length,
      sent_today: after,
      remaining_today: Math.max(0, cap - after),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "寄送失敗" })
  }
})

// ---------------------------------------------------------------------------
// 出貨延後通知
//
// 這是服務信不是行銷信：講的是「你自己那張訂單晚出貨」，所以不看
// marketing_opt_out —— 退訂行銷訊息的客人，訂單晚出貨一樣要知道。
//
// 名單由管理者指定訂單編號，不是系統推算的。缺哪個品項、哪幾張單受影響，
// 只有看著庫存和訂單的人知道；系統猜錯會寄給不該收的人，而這種信寄出去
// 收不回來。
// ---------------------------------------------------------------------------

type DelayTarget = { orderNumber: string; name: string; email: string }

/** 訂單編號 → 收件人。查不到 email 的會被挑出來回報，不會默默跳過。 */
async function delayTargets(
  orderNumbers: string[],
): Promise<{ targets: DelayTarget[]; missing: string[] }> {
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, user_id, guest_email")
    .in("order_number", orderNumbers)
    .is("deleted_at", null)

  const rows = (orders ?? []) as Array<{
    id: string
    order_number: string
    user_id: string | null
    guest_email: string | null
  }>

  const { data: addrs } = await supabase
    .from("order_addresses")
    .select("order_id, name, email")
    .eq("type", "shipping")
    .in("order_id", rows.map((r) => r.id))
  const addrByOrder = new Map(
    ((addrs ?? []) as Array<{ order_id: string; name: string | null; email: string | null }>)
      .map((a) => [a.order_id, a]),
  )

  // 會員的信箱在 auth.users，一次撈完
  const emailById = new Map<string, string>()
  const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of authList?.users ?? []) if (u.email) emailById.set(u.id, u.email)

  const targets: DelayTarget[] = []
  const missing: string[] = []
  for (const num of orderNumbers) {
    const row = rows.find((r) => r.order_number === num)
    if (!row) {
      missing.push(num)
      continue
    }
    const addr = addrByOrder.get(row.id)
    // 訪客訂單的信箱在 guest_email，會員的在 auth.users，兩邊都沒有才看收件地址
    const email = row.guest_email ?? (row.user_id ? emailById.get(row.user_id) : null) ?? addr?.email
    if (!email) {
      missing.push(num)
      continue
    }
    targets.push({ orderNumber: num, name: addr?.name ?? "", email })
  }
  return { targets, missing }
}

const delaySchema = z.object({
  /** 要通知的訂單編號 */
  orderNumbers: z.array(z.string().min(6).max(20)).min(1).max(50),
  /** 出貨日，照著印在信上，例「10/15（四）」。星期幾由管理者寫，程式不猜。 */
  shipDate: z.string().min(2).max(40),
  confirm: z.literal(true),
})

/** GET —— 先看名單長怎樣，不寄。 */
adminBroadcastRouter.get("/order-delay", async (req, res) => {
  try {
    const raw = typeof req.query.orders === "string" ? req.query.orders : ""
    const nums = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
    if (nums.length === 0) {
      res.json({ targets: [], missing: [], sent_today: await sentToday(), daily_cap: await dailySendCap() })
      return
    }
    const { targets, missing } = await delayTargets(nums)
    const [today, cap] = await Promise.all([sentToday(), dailySendCap()])
    res.json({
      targets: targets.map((t) => ({ order_number: t.orderNumber, name: t.name, email: t.email })),
      missing,
      sent_today: today,
      daily_cap: cap,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "名單產生失敗" })
  }
})

/** POST —— 真的寄。 */
adminBroadcastRouter.post("/order-delay", async (req, res) => {
  const parsed = delaySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { orderNumbers, shipDate } = parsed.data

  try {
    const { targets, missing } = await delayTargets(orderNumbers)
    if (targets.length === 0) {
      res.status(400).json({ error: "指定的訂單都找不到收件信箱", missing })
      return
    }

    const sent: string[] = []
    const failed: string[] = []
    for (const t of targets) {
      try {
        await sendEmail({
          to: t.email,
          subject: ORDER_DELAY_SUBJECT,
          html: renderOrderDelayNotice({
            customerName: t.name,
            orderNumber: t.orderNumber,
            shipDate,
          }),
        })
        sent.push(t.orderNumber)
      } catch (err) {
        console.error(`[broadcast] 出貨延後通知寄送失敗 ${t.orderNumber}:`, err)
        failed.push(t.orderNumber)
      }
      // 跟其他廣播一樣的節流，避免一次打爆寄信服務
      await new Promise((r) => setTimeout(r, 150))
    }

    res.json({ sent: sent.length, sent_orders: sent, failed, missing })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "寄送失敗" })
  }
})
