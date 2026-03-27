import { createClient } from "@/lib/supabase/server"

export async function getRevenueByDay(days = 30) {
  const supabase = await createClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data } = await supabase
    .from("orders")
    .select("total, created_at")
    .gte("created_at", since.toISOString())
    .eq("payment_status", "paid")

  const byDay: Record<string, number> = {}
  for (const order of data ?? []) {
    const day = (order.created_at as string).slice(0, 10)
    byDay[day] = (byDay[day] ?? 0) + Number(order.total)
  }

  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }))
}

export async function getOrdersByStatus() {
  const supabase = await createClient()
  const { data } = await supabase.from("orders").select("status")

  const counts: Record<string, number> = {}
  for (const order of data ?? []) {
    counts[order.status] = (counts[order.status] ?? 0) + 1
  }
  return Object.entries(counts).map(([status, count]) => ({ status, count }))
}

export async function getTopProducts(limit = 10) {
  const supabase = await createClient()
  const { data } = await supabase.from("order_items").select("product_snapshot, qty, unit_price")

  const products: Record<string, { name: string; revenue: number; qty: number }> = {}
  for (const item of data ?? []) {
    const snapshot = item.product_snapshot as { product_id?: string; name?: string }
    const key = snapshot?.product_id ?? snapshot?.name ?? "unknown"
    const name = snapshot?.name ?? key
    products[key] = {
      name,
      revenue:
        (products[key]?.revenue ?? 0) + Number(item.unit_price) * (item.qty as number),
      qty: (products[key]?.qty ?? 0) + (item.qty as number),
    }
  }
  return Object.values(products)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
}

export async function getMembershipTierDistribution() {
  const supabase = await createClient()
  const { data } = await supabase.from("user_profiles").select("membership_tiers(name)")

  const counts: Record<string, number> = {}
  for (const profile of data ?? []) {
    const name =
      (profile.membership_tiers as unknown as { name: string } | null)?.name ?? "一般會員"
    counts[name] = (counts[name] ?? 0) + 1
  }
  return Object.entries(counts).map(([tier, count]) => ({ tier, count }))
}

export async function getSubscriptionMRR() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("subscriptions")
    .select("subscription_plans(price)")
    .eq("status", "active")

  const mrr = (data ?? []).reduce((sum, sub) => {
    return sum + Number((sub.subscription_plans as unknown as { price: number } | null)?.price ?? 0)
  }, 0)
  return mrr
}
