"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { API_URL } from "@/lib/api-url"
import { createClient } from "@/lib/supabase/client"

type ReferralInfo = {
  code: string
  confirmed_count: number
  earned_points: number
  rules: { min_order: number; referee_reward: number; referrer_points: number }
}

/**
 * 推薦朋友。
 *
 * 推薦碼是在第一次打開這張卡時才配發的（後端 ensureReferralCode），所以這裡
 * 一定要等 API 回來才顯示，不能先畫一個空的碼。
 */
export function ReferralCard() {
  const [info, setInfo] = useState<ReferralInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = (await createClient().auth.getSession()).data.session?.access_token
        const res = await fetch(`${API_URL}/referral/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(String(res.status))
        if (!cancelled) setInfo((await res.json()) as ReferralInfo)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) return null
  if (!info) {
    return (
      <section className="mt-8 rounded-lg border border-[#10305a]/15 p-5">
        <p className="text-sm text-[#687279]">推薦資料載入中…</p>
      </section>
    )
  }

  const link = `https://realreal.cc/?invite=${info.code}`

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已複製${what}`)
    } catch {
      // 沒有剪貼簿權限時不要只跳一個「失敗」—— 碼就在畫面上，讓人自己選取
      toast.error("複製失敗，請手動選取")
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-[#10305a]/15 bg-[#10305a]/5 p-5">
      <h2 className="mb-1 font-semibold text-[#10305a]">推薦朋友，雙方各得 {info.rules.referee_reward} 元</h2>
      <p className="mb-4 text-sm text-[#687279]">
        朋友第一次購物，折扣前滿 {info.rules.min_order} 元，
        他得 {info.rules.referee_reward} 元購物金（下次購物可折），
        你得 {info.rules.referrer_points} 元公益存款回饋金。
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-[#10305a]/20 bg-white px-4 py-2 font-mono text-lg tracking-[0.3em] text-[#10305a]">
          {info.code}
        </span>
        <button
          type="button"
          onClick={() => void copy(info.code, "推薦碼")}
          className="rounded-md border border-[#10305a]/25 px-3 py-2 text-sm text-[#10305a] hover:bg-white"
        >
          複製推薦碼
        </button>
        <button
          type="button"
          onClick={() => void copy(link, "邀請連結")}
          className="rounded-md bg-[#10305a] px-3 py-2 text-sm text-white hover:bg-[#10305a]/90"
        >
          複製邀請連結
        </button>
      </div>

      <p className="text-sm text-[#687279]">
        {info.confirmed_count > 0
          ? `已經有 ${info.confirmed_count} 位朋友完成首購，累積 ${info.earned_points} 元公益存款回饋金。`
          : "把連結傳給朋友就可以了，他下單時系統會自動認出來。"}
      </p>
    </section>
  )
}
