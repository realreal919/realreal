import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { getSetting } from "../lib/settings"
import { generateCouponCode } from "../lib/repurchase-coupon"
import { ensureReferralCode, loadReferralSettings } from "../lib/referral-service"
import { renderAndSendEmail } from "../workers/email-sender"

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
async function sentToday(): Promise<number> {
  const today = twToday()
  const start = new Date(`${today}T00:00:00+08:00`)
  const [{ count: issued }, { count: corrected }] = await Promise.all([
    supabase
      .from("member_coupons")
      .select("id", { count: "exact", head: true })
      .eq("type", "thanks")
      .gte("created_at", start.toISOString()),
    supabase
      .from("member_coupons")
      .select("id", { count: "exact", head: true })
      .eq("type", "thanks")
      .like("note", `%${CORRECTION_MARK} ${today}%`),
  ])
  return (issued ?? 0) + (corrected ?? 0)
}

/**
 * 會員制度更新通知信的收件名單。
 *
 * 寄給「有帳號、沒退訂行銷、還沒拿過感謝券」的人。不限有沒有買過 ——
 * 這封信講的是制度，註冊了就該知道。
 */
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

type CorrectionTarget = Recipient & { couponId: string; note: string }

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
  const pending: CorrectionTarget[] = []
  for (const r of todo) {
    const email = emails.get(r.user_id)
    if (!email || skip.has(email.toLowerCase())) continue
    if (prof.get(r.user_id)?.marketing_opt_out) continue
    pending.push({
      userId: r.user_id,
      email,
      displayName: prof.get(r.user_id)?.display_name ?? "",
      couponId: r.id,
      note: r.note ?? "",
    })
  }
  return { pending, alreadySent }
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
        await supabase
          .from("member_coupons")
          .update({ note: `${t.note}${CORRECTION_MARK} ${twToday()}` })
          .eq("id", t.couponId)
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
