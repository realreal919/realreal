"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"

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

function HeroImageUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError("檔案大小不能超過 10MB"); return }
    if (!file.type.startsWith("image/")) { setError("只接受圖片檔案"); return }

    setUploading(true)
    setError(null)
    const ext = file.name.split(".").pop()
    const path = `hero/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, file)

    if (uploadError) { setError(uploadError.message); setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(path)
    onChange(publicUrl)
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="space-y-3">
      {value && (
        <div className="relative w-full aspect-[16/7] rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
          <Image src={value} alt="Hero banner" fill className="object-cover" unoptimized />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded hover:bg-black/80 transition-colors"
          >
            移除
          </button>
        </div>
      )}
      <div className="flex gap-2 items-center">
        <input ref={inputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "上傳中..." : value ? "更換圖片" : "上傳圖片"}
        </Button>
        <span className="text-xs text-gray-400">或直接輸入圖片網址</span>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://... 或上傳圖片後自動填入"
        className="text-xs"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
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
          {/* Hero image upload */}
          <div className="space-y-1">
            <Label>Banner 底圖</Label>
            <div className="mt-1">
              <HeroImageUpload
                value={hero.image}
                onChange={(url) => setHero({ ...hero, image: url })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="hero-heading">標題 (heading)</Label>
            <Input
              id="hero-heading"
              value={hero.heading}
              onChange={(e) => setHero({ ...hero, heading: e.target.value })}
              placeholder="自純淨中補給，在誠真中安心"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-subheading">副標題 / 內文 (subheading)</Label>
            <Input
              id="hero-subheading"
              value={hero.subheading}
              onChange={(e) => setHero({ ...hero, subheading: e.target.value })}
              placeholder="留空則顯示預設五行文案"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="hero-cta-text">CTA 按鈕文字</Label>
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
                placeholder="/shop"
              />
            </div>
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
