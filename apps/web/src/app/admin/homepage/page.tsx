"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

interface HeroData {
  heading: string
  subheading: string
  cta_text: string
  cta_link: string
  image: string
}

interface BannerData {
  text: string
  enabled: boolean
}

export default function AdminHomepagePage() {
  const [hero, setHero] = useState<HeroData>({
    heading: "",
    subheading: "",
    cta_text: "",
    cta_link: "",
    image: "",
  })
  const [banner, setBanner] = useState<BannerData>({ text: "", enabled: false })
  const [savingHero, setSavingHero] = useState(false)
  const [savingBanner, setSavingBanner] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [heroRes, bannerRes] = await Promise.all([
          fetch(`${API_URL}/site-contents/homepage_hero`, { credentials: "include" }),
          fetch(`${API_URL}/site-contents/homepage_banner`, { credentials: "include" }),
        ])
        if (heroRes.ok) {
          const data = await heroRes.json()
          setHero({
            heading: data.value?.heading ?? "",
            subheading: data.value?.subheading ?? "",
            cta_text: data.value?.cta_text ?? "",
            cta_link: data.value?.cta_link ?? "",
            image: data.value?.image ?? "",
          })
        }
        if (bannerRes.ok) {
          const data = await bannerRes.json()
          setBanner({
            text: data.value?.text ?? "",
            enabled: data.value?.enabled ?? false,
          })
        }
      } catch {
        toast.error("載入資料失敗")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  async function saveHero() {
    setSavingHero(true)
    try {
      const res = await fetch(`${API_URL}/admin/site-contents/homepage_hero`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: hero }),
      })
      if (res.ok) toast.success("Hero 已儲存")
      else toast.error("儲存失敗")
    } catch {
      toast.error("儲存失敗")
    } finally {
      setSavingHero(false)
    }
  }

  async function saveBanner() {
    setSavingBanner(true)
    try {
      const res = await fetch(`${API_URL}/admin/site-contents/homepage_banner`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: banner }),
      })
      if (res.ok) toast.success("跑馬燈已儲存")
      else toast.error("儲存失敗")
    } catch {
      toast.error("儲存失敗")
    } finally {
      setSavingBanner(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-[#687279]">載入中...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[#10305a]">首頁編輯</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-[#10305a]">Hero 編輯</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="hero-heading">標題 (heading)</Label>
            <Input
              id="hero-heading"
              value={hero.heading}
              onChange={(e) => setHero({ ...hero, heading: e.target.value })}
              placeholder="主標題"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-subheading">副標題 (subheading)</Label>
            <Input
              id="hero-subheading"
              value={hero.subheading}
              onChange={(e) => setHero({ ...hero, subheading: e.target.value })}
              placeholder="副標題"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="hero-cta-text">CTA 文字</Label>
              <Input
                id="hero-cta-text"
                value={hero.cta_text}
                onChange={(e) => setHero({ ...hero, cta_text: e.target.value })}
                placeholder="立即選購"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hero-cta-link">CTA 連結</Label>
              <Input
                id="hero-cta-link"
                value={hero.cta_link}
                onChange={(e) => setHero({ ...hero, cta_link: e.target.value })}
                placeholder="/products"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-image">圖片 URL</Label>
            <Input
              id="hero-image"
              value={hero.image}
              onChange={(e) => setHero({ ...hero, image: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <Button onClick={saveHero} disabled={savingHero} className="bg-[#10305a] hover:bg-[#10305a]/90">
            {savingHero ? "儲存中..." : "儲存 Hero"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-[#10305a]">跑馬燈</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="banner-text">跑馬燈文字</Label>
            <Input
              id="banner-text"
              value={banner.text}
              onChange={(e) => setBanner({ ...banner, text: e.target.value })}
              placeholder="跑馬燈訊息..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="banner-enabled"
              checked={banner.enabled}
              onChange={(e) => setBanner({ ...banner, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="banner-enabled">啟用跑馬燈</Label>
          </div>
          <Button onClick={saveBanner} disabled={savingBanner} className="bg-[#10305a] hover:bg-[#10305a]/90">
            {savingBanner ? "儲存中..." : "儲存跑馬燈"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
