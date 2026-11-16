"use client"

import { useState } from "react"
import { API_URL } from "@/lib/api-url"

/**
 * 缺貨商品的到貨通知登記。
 *
 * 只在「每個規格都買不到」時才出現（由 AddToCartSection 判斷）。還有別的規格
 * 能買的時候放這一塊，等於在能成交的頁面上請人改天再來。
 *
 * 留下信箱之後只會收到一封信，而且是店主在後台按下按鈕才寄的 —— 補貨數量常常
 * 不夠所有人，自動寄等於同時叫一群人來搶。
 */
export function RestockNotify({ productId }: { productId: string }) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [message, setMessage] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (state === "sending") return
    setState("sending")
    setMessage("")
    try {
      const res = await fetch(`${API_URL}/restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, email: email.trim() }),
      })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setState("error")
        setMessage(json?.error ?? "暫時無法登記，請稍後再試")
        return
      }
      setState("done")
    } catch {
      setState("error")
      setMessage("暫時無法登記，請稍後再試")
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-lg border border-[#10305a]/15 bg-[#f7f9fc] p-4 text-sm" style={{ color: "#10305a" }}>
        <p className="font-semibold">已經記下來了 🌱</p>
        <p className="mt-1" style={{ color: "#48515c" }}>
          到貨時我們會寄一封信到 {email}，只會寄這一次。
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-[#10305a]/15 bg-[#f7f9fc] p-4">
      <p className="text-sm font-semibold" style={{ color: "#10305a" }}>
        到貨通知我
      </p>
      <p className="mt-1 text-sm" style={{ color: "#48515c" }}>
        留下信箱，這個口味補貨時我們寄信告訴您。
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="min-w-0 flex-1 rounded-md border border-[#d8dee6] bg-white px-3 py-2 text-sm outline-none focus:border-[#10305a]"
          aria-label="到貨通知的電子信箱"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="shrink-0 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "#10305a" }}
        >
          {state === "sending" ? "送出中…" : "通知我"}
        </button>
      </div>
      {state === "error" && (
        <p className="mt-2 text-sm" style={{ color: "#b45309" }}>
          {message}
        </p>
      )}
    </form>
  )
}
