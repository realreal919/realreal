"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Header } from "./Header"
import { Footer } from "./Footer"
import { API_URL } from "@/lib/api-url"
import type { Category } from "@/lib/catalog"
import {
  campaignShippingMessages,
  marqueeShippingMessages,
  type ShippingCampaign,
  type ShippingConfig,
} from "@/lib/shipping-copy"
import { marqueeSpendMessage, type SpendThreshold } from "@/lib/spend-threshold"

function AnnouncementBar() {
  const [shipping, setShipping] = useState<ShippingConfig | null>(null)
  const [campaigns, setCampaigns] = useState<ShippingCampaign[]>([])
  const [spendTiers, setSpendTiers] = useState<SpendThreshold[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          json: {
            shipping?: ShippingConfig | null
            shippingCampaigns?: ShippingCampaign[]
            spendThresholds?: SpendThreshold[]
          } | null,
        ) => {
          if (cancelled) return
          if (json?.shipping) setShipping(json.shipping)
          if (Array.isArray(json?.shippingCampaigns)) setCampaigns(json.shippingCampaigns)
          if (Array.isArray(json?.spendThresholds)) setSpendTiers(json.spendThresholds)
        },
      )
      .catch(() => {
        /* leave shipping null — those lines are omitted rather than wrong */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const spendMessage = marqueeSpendMessage(spendTiers)
  const messages = [
    ...(spendMessage ? [`全站${spendMessage}`] : []),
    "加入會員立即享首購折50元",
    ...marqueeShippingMessages(shipping),
    ...campaignShippingMessages(campaigns),
    "港澳寄件可順豐運費到付",
    "銀杏水蜜桃口味新上市",
  ]
  const items = [...messages, ...messages]

  return (
    <div className="overflow-hidden bg-[#10305a] text-white py-2 text-sm">
      <div className="flex animate-marquee whitespace-nowrap">
        {items.map((msg, i) => (
          <span key={i} className="mx-8 inline-flex items-center gap-2">
            <span className="text-yellow-300">★</span>
            {msg}
          </span>
        ))}
      </div>
    </div>
  )
}

export function StorefrontShell({
  children,
  categories,
  headerUser,
}: {
  children: React.ReactNode
  categories: Category[]
  headerUser: { initial: string } | null
}) {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith("/admin")

  if (isAdmin) {
    return <>{children}</>
  }

  return (
    <>
      <AnnouncementBar />
      <Header categories={categories} headerUser={headerUser} />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      <Footer />
    </>
  )
}
