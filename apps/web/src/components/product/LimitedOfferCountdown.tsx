"use client"

import { useEffect, useState } from "react"
import { Clock } from "lucide-react"
import { formatRemaining, remainingParts } from "@/lib/limited-offers"

/**
 * 商品頁的限時方案倒數。
 *
 * 時間只在瀏覽器算 —— 伺服器算一次再送出去，客人停在頁面上數字就不會動，
 * 而且 server/client 兩邊的「現在」不同會造成 hydration 不一致。所以首次
 * render 回 null，掛載後才顯示。
 * 倒數結束就整塊消失（remainingParts 回 null），不留一個停在 00:00:00 的框。
 */
export function LimitedOfferCountdown({ endsAt, label }: { endsAt: string; label: string }) {
  const [parts, setParts] = useState<ReturnType<typeof remainingParts>>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const tick = () => setParts(remainingParts(endsAt))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAt])

  if (!mounted || !parts) return null

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
      style={{ color: "#92400e" }}
      aria-live="off"
    >
      <Clock className="h-4 w-4 shrink-0" />
      <span className="font-semibold">{label}</span>
      <span>倒數</span>
      <span className="font-mono font-bold tabular-nums">{formatRemaining(parts)}</span>
    </div>
  )
}
