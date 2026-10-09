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
  created_at: string
  updated_at: string
  metadata: { shipped_at?: string } | null
  order_items: Array<{ qty: number }>
}

/** 沒有 metadata.shipped_at 的舊訂單，用建立日加上這個天數推估出貨。 */
export const TYPICAL_SHIP_LAG_DAYS = 2

/**
 * 這張訂單的出貨時間。
 *
 * **不能用 updated_at** —— 它是「最後一次任何欄位被改動」的時間，不是出貨時間。
 * 批次改狀態、補發票、後台點一下都會把它推到今天。實測 351 張已出貨訂單裡有
 * 328 張的 updated_at 離建立超過兩天，用它算「出貨後第 14 天」會整批算錯。
 *
 * metadata.shipped_at 是出貨時真的寫下去的時間，但只有較新的訂單有（84/351）。
 * 舊訂單退而求其次用「建立日 + 典型出貨落差」，至少不會被後來的異動污染。
 */
export function shipDateOf(order: {
  created_at: string
  metadata?: { shipped_at?: string } | null
}): Date | null {
  const recorded = order.metadata?.shipped_at
  if (recorded) {
    const d = new Date(recorded)
    if (!Number.isNaN(d.getTime())) return d
  }
  const created = new Date(order.created_at)
  if (Number.isNaN(created.getTime())) return null
  created.setDate(created.getDate() + TYPICAL_SHIP_LAG_DAYS)
  return created
}

export type SweepResult = { sent: number; skipped: number }

/**
 * 找出該收這封信的人，逐一交給 send()。
 *
 * send() 失敗不會中斷整批 —— 一個人的信寄不出去，不該讓後面的人也收不到。
 */
export async function sweepFirstOrderMail<T = void>({
  days,
  reminderType,
  maxLateDays = 14,
  maxPerRun = 60,
  lookbackDays = 120,
  now = new Date(),
  prepare,
  send,
  label,
}: {
  /** 出貨後第幾天 */
  days: number
  /** 寫進 reminders.type，用來擋重複 */
  reminderType: string
  /** 到期後最多還能補寄幾天。null = 不限（不建議） */
  maxLateDays?: number | null
  /** 單次最多寄幾封 */
  maxPerRun?: number
  lookbackDays?: number
  now?: Date
  label: string
  /**
   * 寄信前要先準備的東西（例如發一張帶碼的回購券）。
   *
   * 刻意跑在寫 reminders 之前：它一旦失敗，這個人就跳過，而且沒有被
   * 標記成「已提醒」—— 下次再跑還會被挑到。寫在後面的話，券發不出來
   * 的人會永遠失去這封信，而且沒有任何地方看得出來。
   */
  prepare?: (c: FirstOrderCandidate) => Promise<T>
  send: (c: FirstOrderCandidate, prepared: T) => Promise<void>
}): Promise<SweepResult> {
  const since = new Date(now)
  since.setDate(since.getDate() - lookbackDays)

  const { data, error } = await supabase
    .from("orders")
    .select("id, user_id, order_number, created_at, updated_at, metadata, order_items(qty)")
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

    const ship = shipDateOf(order)
    const dueAt = ship ? dueAfterShip(ship.toISOString(), days) : null
    if (!dueAt || dueAt > now) {
      skipped++
      continue
    }
    // 時效窗：過期太久就不補寄。對三個月前買的人問「這段時間喝得還
    // 習慣嗎」沒有意義，而且系統第一次上線時會把所有歷史訂單一次全部
    // 补寄出去 —— 一個早上一百多封，寄件聲譽也承受不起。
    if (maxLateDays != null && now.getTime() - dueAt.getTime() > maxLateDays * 86_400_000) {
      skipped++
      continue
    }
    // 單次上限：排队的人分幾天寄完，不要一次爆出去
    if (sent >= maxPerRun) {
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

    const candidate: FirstOrderCandidate = {
      userId,
      orderId: order.id,
      orderNumber: order.order_number,
      displayName: (profile as { display_name?: string } | null)?.display_name ?? "",
      email,
      dueAt,
    }

    // 先把要寄的東西準備好。失敗就跳過這個人，不寫 reminders ——
    // 下次再跑時他還在名單上。
    let prepared: T
    try {
      prepared = (prepare ? await prepare(candidate) : (undefined as T))
    } catch (err) {
      console.warn(`[${label}] 準備失敗，跳過且不標記 user=${userId}:`, err)
      skipped++
      continue
    }

    // 再記 reminders，最後寄信：唯一索引是唯一能擋「同一天跑兩次就寄兩封」
    // 的東西。寄完才記的話，寄信成功但寫入失敗就會重寄，而客人已經收到了。
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
      await send(candidate, prepared)
      sent++
    } catch (err) {
      console.warn(`[${label}] 寄信失敗 user=${userId}:`, err)
    }
  }

  console.log(`[${label}] 寄出 ${sent} 封，略過 ${skipped} 位`)
  return { sent, skipped }
}
