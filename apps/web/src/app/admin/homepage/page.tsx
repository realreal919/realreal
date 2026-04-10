"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

interface HeroData {
  heading: string
  subheading: string
  cta_text: string
  cta_link: string
  image: string
  image_scale: number
  image_position_x: number
  image_position_y: number
}

interface BannerData {
  text: string
  enabled: boolean
}

/* ─── Single-image upload ─────────────────────────────────── */
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
    <div className="space-y-2">
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
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-xs text-red-500 hover:underline">
            移除
          </button>
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://... 或上傳圖片後自動填入"
        className="text-xs font-mono"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

/* ─── Slider control ──────────────────────────────────────── */
function SliderField({
  label, hint, value, min, max, step, unit, onChange
}: {
  label: string; hint?: string; value: number; min: number; max: number; step: number; unit?: string
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}{hint && <span className="ml-1.5 text-gray-400 font-normal">{hint}</span>}</Label>
        <span className="text-xs font-mono text-[#10305a] w-12 text-right">{value}{unit ?? ""}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#10305a]"
      />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{min}{unit ?? ""}</span>
        <span>{max}{unit ?? ""}</span>
      </div>
    </div>
  )
}

/* ─── Hero live preview ───────────────────────────────────── */
function HeroPreview({ hero }: { hero: HeroData }) {
  const bgImage = hero.image || "/brand/hero-banner.jpg"
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">即時預覽</Label>
      <div
        className="relative w-full rounded-lg overflow-hidden border border-gray-200"
        style={{ aspectRatio: "16/6" }}
      >
        {/* background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url('${bgImage}')`,
            backgroundSize: `${hero.image_scale}%`,
            backgroundPosition: `${hero.image_position_x}% ${hero.image_position_y}%`,
            backgroundRepeat: "no-repeat",
            backgroundColor: "#eef3f9",
          }}
        />
        {/* gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to right, rgba(238,243,249,0.97) 0%, rgba(238,243,249,0.92) 40%, rgba(238,243,249,0.55) 65%, rgba(238,243,249,0) 100%)" }}
        />
        {/* text placeholder */}
        <div className="relative z-10 h-full flex flex-col justify-center px-6 gap-1.5">
          <div className="w-28 h-1.5 rounded bg-[#10305a]/20" />
          <div className="w-44 h-3.5 rounded bg-[#10305a]/50" />
          <div className="w-32 h-2 rounded bg-[#687279]/30 mt-1" />
          <div className="w-24 h-7 rounded-full bg-[#10305a]/70 mt-2" />
        </div>
      </div>
    </div>
  )
}

/* ─── Page ────────────────────────────────────────────────── */
export default function AdminHomepagePage() {
  const [hero, setHero] = useState<HeroData>({
    heading: "",
    subheading: "",
    cta_text: "",
    cta_link: "",
    image: "",
    image_scale: 100,
    image_position_x: 50,
    image_position_y: 50,
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
            image_scale: data.value?.image_scale ?? 100,
            image_position_x: data.value?.image_position_x ?? 50,
            image_position_y: data.value?.image_position_y ?? 50,
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

  function setHeroField<K extends keyof HeroData>(key: K, val: HeroData[K]) {
    setHero(prev => ({ ...prev, [key]: val }))
  }

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
          <CardTitle className="text-sm text-[#10305a]">Hero Banner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Image upload */}
          <div className="space-y-1.5">
            <Label>Banner 底圖</Label>
            <HeroImageUpload
              value={hero.image}
              onChange={(url) => setHeroField("image", url)}
            />
          </div>

          {/* Scale & position sliders */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-4">
            <p className="text-xs font-semibold text-[#10305a]">圖片縮放與位置</p>

            <SliderField
              label="縮放" hint="（數字越小圖越縮，數字越大圖越大）"
              value={hero.image_scale} min={30} max={200} step={5} unit="%"
              onChange={v => setHeroField("image_scale", v)}
            />
            <SliderField
              label="水平位置" hint="（0 = 最左，100 = 最右）"
              value={hero.image_position_x} min={0} max={100} step={1} unit="%"
              onChange={v => setHeroField("image_position_x", v)}
            />
            <SliderField
              label="垂直位置" hint="（0 = 最上，100 = 最下）"
              value={hero.image_position_y} min={0} max={100} step={1} unit="%"
              onChange={v => setHeroField("image_position_y", v)}
            />
          </div>

          {/* Live preview */}
          <HeroPreview hero={hero} />

          {/* Text fields */}
          <div className="space-y-1">
            <Label htmlFor="hero-heading">標題</Label>
            <Input
              id="hero-heading"
              value={hero.heading}
              onChange={(e) => setHeroField("heading", e.target.value)}
              placeholder="自純淨中補給，在誠真中安心"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hero-subheading">內文（留空則顯示預設五行文案）</Label>
            <Input
              id="hero-subheading"
              value={hero.subheading}
              onChange={(e) => setHeroField("subheading", e.target.value)}
              placeholder="留空使用預設文案"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="hero-cta-text">按鈕文字</Label>
              <Input
                id="hero-cta-text"
                value={hero.cta_text}
                onChange={(e) => setHeroField("cta_text", e.target.value)}
                placeholder="立即選購"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hero-cta-link">按鈕連結</Label>
              <Input
                id="hero-cta-link"
                value={hero.cta_link}
                onChange={(e) => setHeroField("cta_link", e.target.value)}
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
