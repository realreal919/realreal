/**
 * 「首購後第 N 天寄一封信」的共用骨架。
 *
 * 回饋信（第 14 天）和回購提醒（第 30 天）挑人的條件一模一樣，只差天數、
 * reminders 的 type、以及要寄什麼。寫成兩套的話，哪天改了「誰算首購」的定義
 * 就只會改到一邊，而且不會有任何錯誤訊息告訴你另一邊沒跟上。
 */
import { supabase } from "./supabase"
import { dueAfterShip } from "./repurchase-coupon"

export type FirstOrderCandidate = {
  userId: string
  orderId: string
  orderNumber: string
  displayName: string
  email: string
  dueAt: Date
}

type OrderRow = {
  id: string
  user_id: string
  order_number: string
  updated_at: string
  order_items: Array<{ qty: number }>
}

export type SweepResult = { sent: number; skipped: number }

/**
 * 找出該收這封信的人，逐一交給 send()。
 *
 * send() 失敗不會中斷整批 —— 一個人的信寄不出去，不該讓後面的人也收不到。
 */
export async function sweepFirstOrderMail({
  days,
  reminderType,
  lookbackDays = 120,
  now = new Date(),
  send,
  label,
}: {
  /** 出貨後第幾天 */
  days: number
  /** 寫進 reminders.type，用來擋重複 */
  reminderType: string
  lookbackDays?: number
  now?: Date
  label: string
  send: (c: FirstOrderCandidate) => Promise<void>
}): Promise<SweepResult> {
  const since = new Date(now)
  since.setDate(since.getDate() - lookbackDays)

  const { data, error } = await supabase
    .from("orders")
    .select("id, user_id, order_number, updated_at, order_items(qty)")
    .not("user_id", "is", null)
    .is("deleted_at", null)
    .in("status", ["shipped", "delivered", "completed"])
    .eq("order_type", "retail")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true })
  if (error) throw new Error(`${label} query failed: ${error.message}`)

  const orders = (data ?? []) as unknown as OrderRow[]

  // 每位會員只看他「最早」那一張 —— 只寄給首購的人
  const firstByUser = new Map<string, OrderRow>()
  const orderCount = new Map<string, number>()
  for (const o of orders) {
    orderCount.set(o.user_id, (orderCount.get(o.user_id) ?? 0) + 1)
    if (!firstByUser.has(o.user_id)) firstByUser.set(o.user_id, o)
  }

  let sent = 0
  let skipped = 0

  for (const [userId, order] of firstByUser) {
    // 已經有第二張訂單 → 人已經回來了
    if ((orderCount.get(userId) ?? 0) > 1) {
      skipped++
      continue
    }
    if (!order.order_items.some((i) => i.qty > 0)) {
      skipped++
      continue
    }

    // 出貨日沒有獨立欄位，用狀態最後異動時間當出貨時間
    const dueAt = dueAfterShip(order.updated_at, days)
    if (!dueAt || dueAt > now) {
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

    // 唯一索引擋重複，但先查一次可以少打一次註定失敗的 insert
    const { count: already } = await supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source_order_id", order.id)
      .eq("type", reminderType)
    if ((already ?? 0) > 0) {
      skipped++
      continue
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(userId)
    const email = authUser.user?.email
    if (!email) {
      skipped++
      continue
    }

    // 先記 reminders 再寄信：唯一索引是唯一能擋「同一天跑兩次就寄兩封」的東西。
    // 寄完才記的話，寄信成功但寫入失敗就會重寄，而客人已經收到了。
    const { error: remErr } = await supabase.from("reminders").insert({
      user_id: userId,
      source_order_id: order.id,
      type: reminderType,
      channel: "email",
      scheduled_at: dueAt.toISOString(),
      sent_at: now.toISOString(),
    })
    if (remErr) {
      console.warn(`[${label}] 寫入提醒紀錄失敗，略過寄信 user=${userId}:`, remErr)
      skipped++
      continue
    }

    try {
      await send({
        userId,
        orderId: order.id,
        orderNumber: order.order_number,
        displayName: (profile as { display_name?: string } | null)?.display_name ?? "",
        email,
        dueAt,
      })
      sent++
    } catch (err) {
      console.warn(`[${label}] 寄信失敗 user=${userId}:`, err)
    }
  }

  console.log(`[${label}] 寄出 ${sent} 封，略過 ${skipped} 位`)
  return { sent, skipped }
}
