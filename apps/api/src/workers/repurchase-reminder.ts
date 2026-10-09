/**
 * 回購提醒 —— 每日 10:00（台灣時間）掃一次。
 *
 * 找出「首購已到貨滿 N 天、還沒下第二張單、沒退訂行銷、也還沒提醒過」的會員，
 * 發一張夾鏈袋回購券並寄信通知。每人每張來源訂單只提醒一次，不連續追。
 *
 * 到貨日多數時候拿不到 —— 7-11 走交貨便批次上傳，不經站上的綠界物流整合，
 * 所以綠界的取貨回報永遠不會回來。提醒時間一律以「出貨日 + 推估天數」起算，
 * 這是常態不是備案。
 *
 * 管道只做 Email。LINE 要接 Messaging API 並建立每位會員的 LINE user ID 對應，
 * 系統裡沒有那份資料，硬做會讓整個提醒卡在綁定上。
 */
import { Worker, Queue } from "bullmq"
import { Redis } from "ioredis"
import { supabase } from "../lib/supabase"
import { getSetting } from "../lib/settings"
import { loadScoopGiftConfig } from "../lib/scoop-gift"
import {
  DEFAULT_REMINDER_DAYS,
  reminderDueAt,
  reminderKindFor,
  type ReminderDays,
} from "../lib/repurchase-coupon"
import { renderAndSendEmail } from "./email-sender"

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

export const repurchaseReminderQueue = new Queue("repurchase-reminder", { connection })

function num(raw: string | null, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export type ReminderSettings = {
  days: ReminderDays
  shipToArrivalDays: number
  couponAmount: number
  couponValidDays: number
}

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const [sachet, jarOld, jarNew, arrival, amount, validDays] = await Promise.all([
    getSetting("repurchase.reminder_days_sachet"),
    getSetting("repurchase.reminder_days_jar_old"),
    getSetting("repurchase.reminder_days_jar_new"),
    getSetting("repurchase.ship_to_arrival_days"),
    getSetting("repurchase.coupon_amount"),
    getSetting("repurchase.coupon_valid_days"),
  ])
  return {
    days: {
      sachet: num(sachet, DEFAULT_REMINDER_DAYS.sachet),
      jar_old: num(jarOld, DEFAULT_REMINDER_DAYS.jar_old),
      jar_new: num(jarNew, DEFAULT_REMINDER_DAYS.jar_new),
    },
    shipToArrivalDays: num(arrival, 3),
    couponAmount: num(amount, 50),
    couponValidDays: num(validDays, 14),
  }
}

type OrderRow = {
  id: string
  user_id: string
  order_number: string
  created_at: string
  updated_at: string
  delivered_at: string | null
  order_items: Array<{ qty: number; product_snapshot: Record<string, unknown> | null }>
}

export const repurchaseReminderWorker = new Worker(
  "repurchase-reminder",
  async (job) => {
    if (job.name !== "remind") return

    const now = new Date()
    const settings = await loadReminderSettings()
    const { triggerSlugs } = await loadScoopGiftConfig(getSetting)

    // 只看最近 60 天的已出貨／已完成訂單。再早的不是首購提醒的對象，
    // 而且全表掃描沒有意義。
    const since = new Date(now)
    since.setDate(since.getDate() - 60)

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, user_id, order_number, created_at, updated_at, delivered_at, order_items(qty, product_snapshot)",
      )
      .not("user_id", "is", null)
      .is("deleted_at", null)
      .in("status", ["shipped", "completed"])
      .eq("order_type", "retail")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })
    if (error) throw new Error(`repurchase-reminder query failed: ${error.message}`)

    const orders = (data ?? []) as unknown as OrderRow[]

    // 每位會員只看他「最早」那一張 —— 首購才是提醒的對象
    const firstByUser = new Map<string, OrderRow>()
    const orderCount = new Map<string, number>()
    for (const o of orders) {
      orderCount.set(o.user_id, (orderCount.get(o.user_id) ?? 0) + 1)
      if (!firstByUser.has(o.user_id)) firstByUser.set(o.user_id, o)
    }

    let sent = 0
    let skipped = 0

    for (const [userId, order] of firstByUser) {
      // 已經有第二張訂單 → 人已經回購了，不用提醒
      if ((orderCount.get(userId) ?? 0) > 1) {
        skipped++
        continue
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name, marketing_opt_out")
        .eq("user_id", userId)
        .maybeSingle()
      if ((profile as { marketing_opt_out?: boolean } | null)?.marketing_opt_out) {
        skipped++
        continue
      }

      const items = order.order_items.map((i) => ({
        product_slug: (i.product_snapshot as { product_slug?: string } | null)?.product_slug ?? null,
        line_total: 0,
        qty: i.qty,
      }))
      const kind = reminderKindFor(items, triggerSlugs)
      if (!kind) {
        skipped++
        continue
      }

      const due = reminderDueAt({
        // 出貨日沒有獨立欄位，用狀態最後異動時間當出貨時間
        shippedAt: order.updated_at,
        deliveredAt: order.delivered_at,
        kind,
        days: settings.days,
        shipToArrivalDays: settings.shipToArrivalDays,
      })
      if (!due || due > now) {
        skipped++
        continue
      }

      // 唯一索引擋重複，但先查一次可以少打一次失敗的 insert
      const { count: already } = await supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("source_order_id", order.id)
        .eq("type", "auto")
      if ((already ?? 0) > 0) {
        skipped++
        continue
      }

      const validUntil = new Date(now)
      validUntil.setDate(validUntil.getDate() + settings.couponValidDays)

      const { data: coupon, error: couponErr } = await supabase
        .from("member_coupons")
        .insert({
          user_id: userId,
          type: "repurchase",
          amount: settings.couponAmount,
          valid_until: validUntil.toISOString(),
          source_order_id: order.id,
        })
        .select("id")
        .single()
      if (couponErr || !coupon) {
        console.warn(`[repurchase-reminder] 建立回購券失敗 user=${userId}:`, couponErr)
        continue
      }

      // 先記 reminders 再寄信：唯一索引是唯一能擋「同一天跑兩次就寄兩封」的東西。
      // 寄完才記的話，寄信成功但寫入失敗就會重寄，而客人已經收到了。
      const { error: remErr } = await supabase.from("reminders").insert({
        user_id: userId,
        source_order_id: order.id,
        type: "auto",
        channel: "email",
        scheduled_at: due.toISOString(),
        sent_at: now.toISOString(),
      })
      if (remErr) {
        console.warn(`[repurchase-reminder] 寫入提醒紀錄失敗，略過寄信 user=${userId}:`, remErr)
        continue
      }

      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(userId)
        const email = authUser.user?.email
        if (!email) {
          skipped++
          continue
        }
        await renderAndSendEmail({
          template: "repurchase-reminder" as never,
          to: email,
          data: {
            customerName: (profile as { display_name?: string } | null)?.display_name ?? "",
            couponAmount: settings.couponAmount,
            validDays: settings.couponValidDays,
            validUntil: validUntil.toISOString().slice(0, 10),
          } as never,
        })
        sent++
      } catch (err) {
        console.warn(`[repurchase-reminder] 寄信失敗 user=${userId}:`, err)
      }
    }

    console.log(`[repurchase-reminder] 寄出 ${sent} 封，略過 ${skipped} 位`)
    return { sent, skipped }
  },
  { connection },
)
