import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import {
  ensureReferralCode,
  loadReferralSettings,
  resolveReferrer,
} from "../lib/referral-service"
import { normalizeCode } from "../lib/referral"

export const referralRouter = Router()

/**
 * GET /referral/me —— 我的推薦碼與成果。
 *
 * 推薦碼在這裡才配發（見 ensureReferralCode）。
 */
referralRouter.get("/me", requireAuth, async (_req, res) => {
  const userId = res.locals.userId as string
  try {
    const [code, settings] = await Promise.all([
      ensureReferralCode(userId),
      loadReferralSettings(),
    ])
    if (!code) {
      res.status(500).json({ error: "推薦碼配發失敗，請稍後再試" })
      return
    }

    const { data: rows } = await supabase
      .from("referrals")
      .select("status, points, reward_amount, confirmed_at")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false })
      .limit(100)
    const list = (rows ?? []) as Array<{ status: string; points: number | string | null }>
    const confirmed = list.filter((r) => r.status === "confirmed")

    res.json({
      code,
      // 成立幾位、總共得到多少公益存款。只回彙總，不回被推薦人是誰 ——
      // 推薦人沒有理由知道朋友買了什麼、什麼時候買的
      confirmed_count: confirmed.length,
      earned_points: confirmed.reduce((s, r) => s + (Number(r.points) || 0), 0),
      rules: {
        min_order: settings.minOrder,
        referee_reward: settings.refereeReward,
        referrer_points: settings.referrerPoints,
      },
    })
  } catch (err) {
    console.error("[referral] /me 失敗:", err)
    res.status(500).json({ error: "讀取推薦資料失敗" })
  }
})

const checkSchema = z.object({ code: z.string().max(32) })

/**
 * POST /referral/check —— 結帳頁即時驗證推薦碼。
 *
 * 只回「這組碼存在嗎」，不回推薦人是誰 —— 回了就等於提供一支拿推薦碼反查
 * 會員身分的工具。自己填自己的碼在這裡也先擋掉，讓人當場知道，而不是等到
 * 下完單才發現沒有獎勵。
 */
referralRouter.post("/check", requireAuth, async (req, res) => {
  const parsed = checkSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "請輸入推薦碼" })
    return
  }
  const userId = res.locals.userId as string
  const code = normalizeCode(parsed.data.code)
  if (!code) {
    res.json({ valid: false, reason: "推薦碼格式不正確" })
    return
  }
  const referrerId = await resolveReferrer(code)
  if (!referrerId) {
    res.json({ valid: false, reason: "查無這組推薦碼" })
    return
  }
  if (referrerId === userId) {
    res.json({ valid: false, reason: "不能使用自己的推薦碼" })
    return
  }

  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("order_type", "retail")
    .in("status", ["paid", "processing", "shipped", "delivered", "completed"])
  if ((count ?? 0) > 0) {
    res.json({ valid: false, reason: "推薦獎勵限第一次購買的新朋友" })
    return
  }

  const settings = await loadReferralSettings()
  res.json({ valid: true, code, min_order: settings.minOrder, reward: settings.refereeReward })
})
