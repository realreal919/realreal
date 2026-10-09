import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import {
  INTERACTION_TYPES,
  canCount,
  checkUpgrade,
  isInteractionType,
  pointsFor,
  type CountedInteraction,
} from "../lib/interactions"

export const adminShareReportsRouter = Router()

// 這裡看得到會員 Email 與分享內容，一律要管理員身分
adminShareReportsRouter.use(requireAuth, requireAdmin)

type ReportRow = {
  id: string
  user_id: string | null
  email: string | null
  link: string | null
  screenshot_url: string | null
  message: string | null
  is_duplicate: boolean
  status: string
  note: string | null
  created_at: string
}

/**
 * 把會員的互動紀錄一次抓回來。
 *
 * 每月上限與升等資格都要看「這個人過去的紀錄」，逐列各查一次會變成 N+1；
 * 回報通常是一週看一批，一次抓完再在記憶體裡算。
 */
async function loadInteractions(userIds: string[]): Promise<Map<string, CountedInteraction[]>> {
  const map = new Map<string, CountedInteraction[]>()
  if (userIds.length === 0) return map
  const { data } = await supabase
    .from("member_interactions")
    .select("user_id, type, points, occurred_on")
    .in("user_id", userIds)
    .eq("status", "confirmed")
  for (const row of (data ?? []) as Array<CountedInteraction & { user_id: string }>) {
    const list = map.get(row.user_id) ?? []
    list.push(row)
    map.set(row.user_id, list)
  }
  return map
}

// GET /admin/share-reports?status=pending
adminShareReportsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending"
  let query = supabase
    .from("share_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300)
  if (status !== "all") query = query.eq("status", status)

  const { data, error } = await query
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  const rows = (data ?? []) as ReportRow[]
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))]
  const interactions = await loadInteractions(userIds)

  // 顯示會員名稱，讓管理者不用只看 email 猜人
  const names = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .in("user_id", userIds)
    for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string | null }>) {
      if (p.display_name) names.set(p.user_id, p.display_name)
    }
  }

  res.json({
    types: Object.entries(INTERACTION_TYPES).map(([value, v]) => ({
      value,
      label: v.label,
      points: v.points,
    })),
    data: rows.map((r) => {
      const mine = r.user_id ? (interactions.get(r.user_id) ?? []) : []
      return {
        ...r,
        display_name: r.user_id ? (names.get(r.user_id) ?? null) : null,
        is_member: !!r.user_id,
        // 每種類型本月已記幾次 —— 管理者選類型前就看得到會不會超過上限
        monthly_counts: Object.fromEntries(
          Object.keys(INTERACTION_TYPES).map((t) => [
            t,
            mine.filter((i) => i.type === t && sameMonth(i.occurred_on)).length,
          ]),
        ),
        upgrade: r.user_id ? checkUpgrade(mine) : null,
      }
    }),
  })
})

function sameMonth(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

const decideSchema = z.object({
  action: z.enum(["count", "reject"]),
  type: z.string().optional(),
  note: z.string().max(500).optional(),
})

/**
 * PATCH /admin/share-reports/:id —— 記點或不計。
 *
 * 記點時才寫 member_interactions，一筆回報對一筆互動。每月上限在這裡擋，
 * 不是只在畫面上提示 —— 上限的意義是「超過就不該進帳」。
 */
adminShareReportsRouter.patch("/:id", async (req, res) => {
  const parsed = decideSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() })
    return
  }
  const { action, type, note } = parsed.data

  const { data: report } = await supabase
    .from("share_reports")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle()
  if (!report) {
    res.status(404).json({ error: "找不到這筆回報" })
    return
  }
  const r = report as ReportRow
  if (r.status !== "pending") {
    res.status(400).json({ error: `這筆已經處理過了（${r.status}）` })
    return
  }

  if (action === "reject") {
    const { error } = await supabase
      .from("share_reports")
      .update({ status: "rejected", note: note ?? null })
      .eq("id", r.id)
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.json({ ok: true, status: "rejected" })
    return
  }

  if (!isInteractionType(type)) {
    res.status(400).json({ error: "請選擇分享類型" })
    return
  }
  if (!r.user_id) {
    res.status(400).json({ error: "這筆沒有對應到會員，無法記點。請先確認 Email 是否為會員。" })
    return
  }

  const mine = (await loadInteractions([r.user_id])).get(r.user_id) ?? []
  const cap = canCount(mine, type)
  if (!cap.allowed) {
    res.status(400).json({ error: cap.reason })
    return
  }

  const points = pointsFor(type)
  const { error: insErr } = await supabase.from("member_interactions").insert({
    user_id: r.user_id,
    type,
    points,
    link_or_note: r.link ?? r.screenshot_url ?? r.message ?? null,
    occurred_on: r.created_at.slice(0, 10),
    status: "confirmed",
  })
  if (insErr) {
    res.status(500).json({ error: insErr.message })
    return
  }

  const { error: updErr } = await supabase
    .from("share_reports")
    .update({ status: "counted", note: note ?? null })
    .eq("id", r.id)
  if (updErr) {
    // 互動已寫入但回報沒更新 —— 說出來，不要回報成功後讓同一筆被重記一次
    console.error("[admin/share-reports] 互動已記但回報狀態更新失敗:", updErr)
    res.status(500).json({ error: "已記點，但回報狀態更新失敗，請重新整理確認" })
    return
  }

  const after = checkUpgrade([
    ...mine,
    { type, points, occurred_on: r.created_at.slice(0, 10) },
  ])
  res.json({ ok: true, status: "counted", points, upgrade: after })
})
