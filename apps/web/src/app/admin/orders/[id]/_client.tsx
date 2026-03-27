"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { updateOrderStatusAction } from "./actions"

const STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  processing: "處理中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失敗",
}

/* ---------- Action Buttons ---------- */

interface OrderActionsProps {
  orderId: string
  status: string
  paymentStatus: string
}

export function OrderActions({ orderId, status, paymentStatus }: OrderActionsProps) {
  const [isPending, startTransition] = useTransition()

  function handleAction(newStatus: string) {
    startTransition(() => updateOrderStatusAction(orderId, newStatus))
  }

  const showConfirmPayment = status === "pending" && paymentStatus !== "paid"
  const showShip = status === "processing"
  const showComplete = status === "shipped"
  const showCancel = status === "pending" || status === "processing"

  if (!showConfirmPayment && !showShip && !showComplete && !showCancel) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showConfirmPayment && (
        <Button size="sm" disabled={isPending} onClick={() => handleAction("processing")}>
          確認付款
        </Button>
      )}
      {showShip && (
        <Button size="sm" disabled={isPending} onClick={() => handleAction("shipped")}>
          出貨
        </Button>
      )}
      {showComplete && (
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => handleAction("completed")}>
          完成訂單
        </Button>
      )}
      {showCancel && (
        <Button size="sm" variant="destructive" disabled={isPending} onClick={() => handleAction("cancelled")}>
          取消訂單
        </Button>
      )}
    </div>
  )
}

/* ---------- Order Timeline ---------- */

const TIMELINE_STEPS = [
  { key: "pending", label: "訂單建立" },
  { key: "processing", label: "確認付款" },
  { key: "shipped", label: "已出貨" },
  { key: "completed", label: "已完成" },
] as const

interface OrderTimelineProps {
  status: string
  createdAt: string
}

export function OrderTimeline({ status, createdAt }: OrderTimelineProps) {
  const isCancelled = status === "cancelled" || status === "failed"
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.key === status)

  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto py-2">
      {TIMELINE_STEPS.map((step, i) => {
        const isReached = !isCancelled && i <= currentIndex
        const isCurrent = !isCancelled && step.key === status
        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isCurrent
                    ? "bg-zinc-900 text-white ring-2 ring-zinc-900/20"
                    : isReached
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-200 text-zinc-400"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-xs whitespace-nowrap ${isReached ? "text-zinc-900 font-medium" : "text-zinc-400"}`}>
                {step.label}
              </span>
            </div>
            {i < TIMELINE_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  !isCancelled && i < currentIndex ? "bg-zinc-900" : "bg-zinc-200"
                }`}
              />
            )}
          </div>
        )
      })}

      {isCancelled && (
        <div className="flex flex-col items-center gap-1 ml-4">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-red-600 text-white">
            ✕
          </div>
          <span className="text-xs whitespace-nowrap text-red-600 font-medium">
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
      )}
    </div>
  )
}
