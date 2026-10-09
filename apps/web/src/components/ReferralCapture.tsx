"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import {
  REFERRAL_COOKIE,
  REFERRAL_MAX_AGE,
  REFERRAL_PARAM,
  normalizeReferralCode,
} from "@/lib/referral-code"

/**
 * 會員推薦碼的擷取。掛在根 layout，每次導覽都看一下網址。
 *
 * 朋友分享的連結長這樣：https://realreal.cc/?invite=AB12CD
 * 存成 30 天的 cookie，結帳時帶進 POST /orders。客人通常不會點完連結就立刻
 * 下單，存下來才接得住「過兩週才決定要買」的那種。
 */
export function ReferralCapture() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = normalizeReferralCode(searchParams.get(REFERRAL_PARAM))
    if (!code) return
    const parts = [
      `${REFERRAL_COOKIE}=${encodeURIComponent(code)}`,
      `Max-Age=${REFERRAL_MAX_AGE}`,
      "Path=/",
      "SameSite=Lax",
    ]
    if (window.location.protocol === "https:") parts.push("Secure")
    document.cookie = parts.join("; ")
  }, [searchParams])

  return null
}
