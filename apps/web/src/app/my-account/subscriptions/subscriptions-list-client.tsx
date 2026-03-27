"use client"

import { useRouter } from "next/navigation"
import { SubscriptionCard } from "@/components/subscriptions/SubscriptionCard"

type SubRow = {
  id: string
  status: "active" | "paused" | "cancelled" | "past_due"
  next_billing_date: string | null
  retry_count: number
  subscription_plans: { name: string; price: string; interval: string }
}

export function SubscriptionsListClient({ subscriptions }: { subscriptions: SubRow[] }) {
  const router = useRouter()

  function handleRefresh() {
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {subscriptions.map((sub) => (
        <SubscriptionCard key={sub.id} sub={sub} onAction={handleRefresh} />
      ))}
    </div>
  )
}
