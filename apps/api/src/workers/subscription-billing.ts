import { Worker, Queue } from "bullmq"
import { Redis } from "ioredis"
import { supabase } from "../lib/supabase"
import { decryptToken } from "../lib/token-encryption"
import { emailQueue } from "./email-sender"

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null })

export const subscriptionBillingQueue = new Queue("subscription-billing", { connection })

// Idempotency key: sub_{subscriptionId}_{YYYY-MM-DD} in Asia/Taipei
export function buildIdempotencyKey(subscriptionId: string, date: Date = new Date()): string {
  const taipeiDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(date)
  return `sub_${subscriptionId}_${taipeiDate}`
}

export function computeNextBillingDate(interval: string, from: Date = new Date()): Date {
  const next = new Date(from)
  next.setDate(next.getDate() + (interval === "monthly" ? 30 : 60))
  return next
}

async function processSingleSubscription(subscriptionId: string) {
  const idempotencyKey = buildIdempotencyKey(subscriptionId)

  // Idempotency check
  const { data: existing } = await supabase
    .from("subscription_orders")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .single()

  if (existing) return { skipped: true, reason: "already_processed" }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*, subscription_plans(interval, price, name)")
    .eq("id", subscriptionId)
    .single()

  if (!sub || sub.status !== "active") return { skipped: true }

  // Create subscription_orders record first (idempotency guard)
  const { data: subOrder, error: insertError } = await supabase
    .from("subscription_orders")
    .insert({
      subscription_id: subscriptionId,
      billing_cycle: 1,
      idempotency_key: idempotencyKey,
      status: "pending",
    })
    .select()
    .single()

  if (insertError?.code === "23505") return { skipped: true, reason: "duplicate" }
  if (insertError) throw insertError

  try {
    // Decrypt token and charge (PChomePay Token API call would go here)
    const _token = await decryptToken(sub.payment_method_token ?? "")
    // TODO: Call PChomePay Token recurring charge API
    // For now, mark as success

    const plan = sub.subscription_plans as any
    const nextBillingDate = computeNextBillingDate(plan.interval)

    await supabase.from("subscriptions").update({
      next_billing_date: nextBillingDate.toISOString().split("T")[0],
      retry_count: 0,
    }).eq("id", subscriptionId)

    await supabase.from("subscription_orders").update({ status: "completed" }).eq("id", subOrder!.id)

    // Enqueue success email
    await emailQueue.add("email", {
      template: "order-confirmation",
      to: sub.user_id,
      data: { orderNumber: idempotencyKey, items: [], total: plan.price, address: "" },
    })

    return { success: true }

  } catch (err: any) {
    const newRetryCount = (sub.retry_count ?? 0) + 1
    const newStatus = newRetryCount >= 3 ? "past_due" : "active"

    await supabase.from("subscriptions").update({
      retry_count: newRetryCount,
      status: newStatus,
    }).eq("id", subscriptionId)

    await supabase.from("subscription_orders").update({ status: "failed" }).eq("id", subOrder!.id)
    throw err
  }
}

export const subscriptionBillingWorker = new Worker("subscription-billing", async (job) => {
  if (job.name === "daily-billing") {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date())
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("status", "active")
      .lte("next_billing_date", today)

    const results = await Promise.allSettled((subs ?? []).map(s => processSingleSubscription(s.id)))
    return { processed: results.length }
  }

  if (job.name === "bill-subscription") {
    return processSingleSubscription(job.data.subscriptionId)
  }
}, { connection })
