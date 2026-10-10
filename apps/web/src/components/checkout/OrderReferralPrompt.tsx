"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { API_URL } from "@/lib/api-url"
import { createClient } from "@/lib/supabase/client"

type Info = {
  code: string
  rules: { min_order: number; referee_reward: number }
}

/**
 * 訂單完成頁的推薦提示。
 *
 * 放在這裡是因為這是客人最滿意的那一刻 —— 剛付完錢、東西還沒到、期待最高。
 * 會員中心是「有事才會去」的地方，同一段文案放在那裡被看到的機會少得多。
 *
 * 未登入（訪客結帳）時整塊不出現：推薦碼是綁帳號的，拿不到碼就沒有東西好給。
 * 那種情況下畫面上已經有「註冊成為會員」的卡片，不該再多一個要求。
 */
export function OrderReferralPrompt() {
  const [info, setInfo] = useState<Info | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = (await createClient().auth.getSession()).data.session?.access_token
        if (!token) return
        const res = await fetch(`${API_URL}/referral/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        if (!cancelled) setInfo((await res.json()) as Info)
      } catch {
        // 拿不到就不顯示，不要在剛完成訂單的畫面上跳錯誤
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!info) return null

  const link = `https://realreal.cc/?invite=${info.code}`

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已複製${what}`)
    } catch {
      toast.error("複製失敗，請手動選取")
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-[#10305a]/15 bg-[#10305a]/5 p-5 text-left">
      <p className="mb-1 font-semibold text-[#10305a]">順手分享給朋友？</p>
      <p className="mb-4 text-sm leading-6 text-[#687279]">
        朋友首次消費滿 {info.rules.min_order.toLocaleString()} 元，
        您與朋友各獲得 {info.rules.referee_reward} 元公益存款，
        可選擇下次購物折抵，或留存累積，讓善意持續發生。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-[#10305a]/20 bg-white px-3 py-1.5 font-mono tracking-[0.2em] text-[#10305a]">
          {info.code}
        </span>
        <button
          type="button"
          onClick={() => void copy(link, "邀請連結")}
          className="rounded-md bg-[#10305a] px-3 py-1.5 text-sm text-white transition-colors hover:bg-[#10305a]/90"
        >
          複製邀請連結
        </button>
      </div>
    </div>
  )
}
