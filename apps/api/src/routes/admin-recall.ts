import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import {
  BUCKET_LABEL,
  bucketFor,
  daysBetween,
  toCsv,
  type RecallCandidate,
} from "../lib/recall-list"

export const adminRecallRouter = Router()

// 名單含會員 Email，一律要管理員身分
adminRecallRouter.use(requireAuth, requireAdmin)

/** 算得上「買過」的狀態。pending／failed／cancelled 不算。 */
const COUNTS_AS_ORDER = ["paid", "processing", "shipped", "delivered", "completed"]
/** 首購要已經出貨，客人手上有東西才問得出「用得還順嗎」。 */
const FULFILLED = ["shipped", "delivered", "completed"]

type Row = {
  id: string
  user_id: string
  order_number: string
  created_at: string
  status: string
}

/**
 * 一次性召回名單。
 *
 * 只產名單，不自動發送 —— 距今 15~90 天這批人要用什麼語氣、什麼時機，
 * 由店主決定。自動寄的話，同一個人可能前一天剛收到回購提醒。
 */
async function buildList(now: Date): Promise<RecallCandidate[]> {
  // 要判斷「只買過一次」，必須看他全部的訂單，不能只看視窗內的 ——
  // 首購在 30 天前、第二張在 10 天前的人不是召回對象。
  const { data, error } = await supabase
    .from("orders")
    .select("id, user_id, order_number, created_at, status")
    .not("user_id", "is", null)
    .is("deleted_at", null)
    .eq("order_type", "retail")
    .in("status", COUNTS_AS_ORDER)
    .order("created_at", { ascending: true })
    .limit(10000)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Row[]
  const first = new Map<string, Row>()
  const count = new Map<string, number>()
  for (const o of rows) {
    count.set(o.user_id, (count.get(o.user_id) ?? 0) + 1)
    if (!first.has(o.user_id)) first.set(o.user_id, o)
  }

  const candidates: Array<{ row: Row; days: number; bucket: RecallCandidate["bucket"] }> = []
  for (const [userId, row] of first) {
    if ((count.get(userId) ?? 0) > 1) continue
    if (!FULFILLED.includes(row.status)) continue
    const days = daysBetween(row.created_at, now)
    const bucket = bucketFor(days)
    if (!bucket) continue
    candidates.push({ row, days, bucket })
  }
  if (candidates.length === 0) return []

  const userIds = candidates.map((c) => c.row.user_id)

  const [{ data: profiles }, { data: already }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, display_name, marketing_opt_out")
      .in("user_id", userIds),
    // 已經寄過這次召回的人不再出現在名單上 —— 每人只發一次，之後走正常提醒
    supabase
      .from("reminders")
      .select("user_id")
      .eq("type", "manual_batch")
      .in("user_id", userIds),
  ])

  const profile = new Map(
    ((profiles ?? []) as Array<{
      user_id: string
      display_name: string | null
      marketing_opt_out: boolean | null
    }>).map((p) => [p.user_id, p]),
  )
  const sentTo = new Set(((already ?? []) as Array<{ user_id: string }>).map((r) => r.user_id))

  // Email 在 auth.users，一筆一筆查。這份名單是人工操作、一週跑一次，
  // 幾十筆的 round-trip 比多維護一張鏡像表划算。
  const out: RecallCandidate[] = []
  for (const c of candidates) {
    const uid = c.row.user_id
    if (sentTo.has(uid)) continue
    if (profile.get(uid)?.marketing_opt_out) continue
    const { data: authUser } = await supabase.auth.admin.getUserById(uid)
    const email = authUser.user?.email ?? null
    if (!email) continue
    out.push({
      user_id: uid,
      email,
      display_name: profile.get(uid)?.display_name ?? null,
      first_order_number: c.row.order_number,
      first_order_at: c.row.created_at,
      days_since: c.days,
      bucket: c.bucket,
    })
  }

  // 等最久的排前面：好久不見那組再拖下去只會更難開口
  out.sort((a, b) => b.days_since - a.days_since)
  return out
}

// GET /admin/recall-list            → JSON 預覽
// GET /admin/recall-list?format=csv → 下載 CSV
adminRecallRouter.get("/", async (req, res) => {
  try {
    const now = new Date()
    const list = await buildList(now)
    if (req.query.format === "csv") {
      const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(now)
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="recall-${stamp}.csv"`)
      res.send(toCsv(list))
      return
    }
    res.json({
      labels: BUCKET_LABEL,
      counts: {
        reminder: list.filter((r) => r.bucket === "reminder").length,
        long_time_no_see: list.filter((r) => r.bucket === "long_time_no_see").length,
      },
      data: list,
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "名單產生失敗" })
  }
})

const markSchema = z.object({ user_ids: z.array(z.string().uuid()).min(1).max(500) })

/**
 * POST /admin/recall-list/mark —— 標記為「已寄出」。
 *
 * 匯出時不標記：店主可能只是想看看名單。真的寄出去之後才按這裡，名單才會
 * 把這些人移除。分成兩步是為了不讓「預覽一次」就把人用掉。
 */
adminRecallRouter.post("/mark", async (req, res) => {
  const parsed = markSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() })
    return
  }

  const now = new Date()
  const list = await buildList(now).catch(() => null)
  if (!list) {
    res.status(500).json({ error: "名單產生失敗，沒有標記任何人" })
    return
  }
  const byUser = new Map(list.map((r) => [r.user_id, r]))

  let marked = 0
  const skipped: string[] = []
  for (const uid of parsed.data.user_ids) {
    const row = byUser.get(uid)
    // 不在當前名單上的就不標記 —— 來源訂單是從名單算出來的，硬塞會記錯訂單
    if (!row) {
      skipped.push(uid)
      continue
    }
    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", row.first_order_number)
      .maybeSingle()
    if (!order) {
      skipped.push(uid)
      continue
    }
    const { error } = await supabase.from("reminders").insert({
      user_id: uid,
      source_order_id: (order as { id: string }).id,
      type: "manual_batch",
      channel: "email",
      sent_at: now.toISOString(),
      note: BUCKET_LABEL[row.bucket],
    })
    if (error) {
      skipped.push(uid)
      continue
    }
    marked++
  }

  res.json({ ok: true, marked, skipped })
})
