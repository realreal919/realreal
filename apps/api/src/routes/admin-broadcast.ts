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
    res.json({
      pending: list.length,
      already_sent: alreadySent,
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
  const { only, limit = 50 } = parsed.data

  try {
    const { list } = await buildRecipients()
    const targets = only
      ? list.filter((r) => only.includes(r.email.toLowerCase()))
      : list.slice(0, limit)

    if (only && targets.length === 0) {
      res.status(400).json({ error: "指定的 email 不在待寄名單上（可能已經寄過或已退訂）" })
      return
    }

    const rebate = Number(await getSetting("membership.rebate_percent")) || 3
    const referral = await loadReferralSettings()

    let sent = 0
    const failed: string[] = []
    for (const r of targets) {
      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + THANKS_VALID_DAYS)

      // 先發券。發不出來就不寄 —— 信上要印優惠碼，也代表這個人已經寄過了。
      const code = await issueThanksCoupon(r.userId, validUntil)
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
        // 券已經發了但信沒寄出去 —— 說出來，這個人不會被名單再挑到
        console.error(`[broadcast] 寄信失敗（券已發出，需人工補寄）${r.email}:`, err)
        failed.push(r.email)
      }
    }

    const { list: rest } = await buildRecipients()
    res.json({ sent, failed, remaining: rest.length })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "寄送失敗" })
  }
})
