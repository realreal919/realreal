"use client"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Sub = {
  id: string
  status: "active" | "paused" | "cancelled" | "past_due"
  next_billing_date: string | null
  retry_count: number
  subscription_plans: { name: string; price: string; interval: string }
}

const statusLabel = { active: "訂閱中", paused: "已暫停", cancelled: "已取消", past_due: "逾期未付" }
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default", paused: "secondary", cancelled: "secondary", past_due: "destructive"
}

export function SubscriptionCard({ sub, onAction }: { sub: Sub; onAction: () => void }) {
  const [loading, setLoading] = useState(false)
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

  async function handleAction(action: "pause" | "resume" | "cancel") {
    setLoading(true)
    await fetch(`${API_URL}/subscriptions/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action }),
    })
    setLoading(false)
    onAction()
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">{sub.subscription_plans.name}</CardTitle>
          <Badge variant={statusVariant[sub.status]}>{statusLabel[sub.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-600">NT${Number(sub.subscription_plans.price).toLocaleString()} / {sub.subscription_plans.interval === "monthly" ? "月" : "雙月"}</p>
        {sub.next_billing_date && <p className="text-sm">下次扣款：{sub.next_billing_date}</p>}
        {sub.retry_count > 0 && <p className="text-sm text-red-600">⚠️ 已失敗 {sub.retry_count} 次</p>}
        <div className="flex gap-2">
          {sub.status === "active" && <Button variant="outline" size="sm" onClick={() => handleAction("pause")} disabled={loading}>暫停</Button>}
          {sub.status === "paused" && <Button variant="outline" size="sm" onClick={() => handleAction("resume")} disabled={loading}>恢復</Button>}
          {sub.status !== "cancelled" && <Button variant="destructive" size="sm" onClick={() => handleAction("cancel")} disabled={loading}>取消</Button>}
        </div>
      </CardContent>
    </Card>
  )
}
