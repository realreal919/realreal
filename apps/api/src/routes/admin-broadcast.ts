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

const THANKS_AMOUNT = 100
const THANKS_MIN_ORDER = 1500
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
const DEFAULT_DAILY_SEND_CAP = 60

async function dailySendCap(): Promise<number> {
  const raw = await getSetting("broadcast.daily_cap")
  if (raw == null || raw.trim() === "") return DEFAULT_DAILY_SEND_CAP
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_SEND_CAP
}

/** 今天（台灣時間）已經發出幾封廣播信。感謝券的建立時間就是記錄。 */
async function sentToday(): Promise<number> {
  const tw = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date())
  // 台灣時間的今日 00:00 = UTC 前一天 16:00
  const start = new Date(`${tw}T00:00:00+08:00`)
  const { count } = await supabase
    .from("member_coupons")
    .select("id", { count: "exact", head: true })
    .eq("type", "thanks")
    .gte("created_at", start.toISOString())
  return count ?? 0
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

async function issueThanksCoupon(userId: string, validUntil: Date): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCouponCode("TK")
    const { error } = await supabase.from("member_coupons").insert({
      user_id: userId,
      type: "thanks",
      amount: THANKS_AMOUNT,
      min_order: THANKS_MIN_ORDER,
      code,
      valid_until: validUntil.toISOString(),
      note: "老朋友感謝券（會員制度更新通知）",
    })
    if (!error) return code
    const msg = String(error.message)
    // user_id 的唯一索引撞到 = 這個人已經有券了，不是碼撞號
    if (msg.includes("idx_member_coupons_thanks_once")) return null
    if (!msg.includes("duplicate")) {
      console.warn(`[broadcast] 感謝券建立失敗 user=${userId}:`, error)
      return null
    }
  }
  return null
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
      coupon: {
        amount: THANKS_AMOUNT,
        min_order: THANKS_MIN_ORDER,
        valid_days: THANKS_VALID_DAYS,
      },
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
      let code: string | null
      let validUntil: Date
      if (resend) {
        // 補寄沿用原本那張券，不發第二張 —— 人沒收到信，不代表券沒發
        const { data: existing } = await supabase
          .from("member_coupons")
          .select("code, valid_until")
          .eq("user_id", r.userId)
          .eq("type", "thanks")
          .maybeSingle()
        const row = existing as { code: string | null; valid_until: string } | null
        code = row?.code ?? null
        validUntil = row ? new Date(row.valid_until) : new Date()
      } else {
        validUntil = new Date()
        validUntil.setDate(validUntil.getDate() + THANKS_VALID_DAYS)
        // 先發券。發不出來就不寄 —— 信上要印優惠碼，也代表這個人已經寄過了。
        code = await issueThanksCoupon(r.userId, validUntil)
      }
      if (!code) {
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
            couponAmount: THANKS_AMOUNT,
            couponMinOrder: THANKS_MIN_ORDER,
            couponCode: code,
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
