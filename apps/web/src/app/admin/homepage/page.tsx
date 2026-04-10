"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Trash2, MoveUp, MoveDown, ImageIcon, Video, Plus, Star } from "lucide-react"
import type { CarouselItem } from "@/components/ui/review-images-carousel"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

interface HeroData {
  heading: string
  subheading: string   // stored with \n for line breaks
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

interface Testimonial {
  name: string
  text: string
  rating: number
}

const DEFAULT_CAROUSEL: CarouselItem[] = [
  { type: "video", src: "/brand/review-video.mov", alt: "顧客回饋影片" },
  { type: "image", src: "https://realreal.cc/wp-content/uploads/2026/02/S__73097241_0-576x1024.jpg", alt: "顧客回饋 1" },
  { type: "image", src: "https://realreal.cc/wp-content/uploads/2026/02/S__73097242_0-576x1024.jpg", alt: "顧客回饋 2" },
  { type: "image", src: "https://realreal.cc/wp-content/uploads/2026/02/回饋5-576x1024.jpg", alt: "顧客回饋 3" },
  { type: "image", src: "https://realreal.cc/wp-content/uploads/2026/02/回饋1-576x1024.jpg", alt: "顧客回饋 4" },
  { type: "image", src: "https://realreal.cc/wp-content/uploads/2026/02/回饋2-576x1024.jpg", alt: "顧客回饋 5" },
  { type: "image", src: "https://realreal.cc/wp-content/uploads/2026/02/回饋3-576x1024.jpg", alt: "顧客回饋 6" },
  { type: "image", src: "https://realreal.cc/wp-content/uploads/2026/02/回饋4-653x1024.jpg", alt: "顧客回饋 7" },
  { type: "image", src: "https://realreal.cc/wp-content/uploads/2026/02/FCF1A2D1-116B-4048-A859-ECA627D3CFEB-576x1024.jpg", alt: "顧客回饋 8" },
]

/* ─── Auth token ──────────────────────────────────────────── */
async function getToken(): Promise<string> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ""
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
        <Label className="text-xs">
          {label}
          {hint && <span className="ml-1.5 text-gray-400 font-normal">{hint}</span>}
        </Label>
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
const DEFAULT_BODY = [
  "補充體力、維持精神",
  "身體好吸收、不負擔的營養",
  "每一天，都多一點力氣與穩定",
  "身心安然",
  "回到自在的生活節奏",
]

function HeroPreview({ hero }: { hero: HeroData }) {
  const bgImage = hero.image || "/brand/hero-banner.jpg"
  const heading = hero.heading || "自純淨中補給，在誠真中安心"
  const bodyLines = hero.subheading
    ? hero.subheading.split("\n").filter(Boolean)
    : DEFAULT_BODY

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
        {/* text */}
        <div className="relative z-10 h-full flex flex-col justify-center px-6 gap-0.5" style={{ maxWidth: "55%" }}>
          <p className="text-[7px] font-semibold tracking-widest text-[#10305a]/40 uppercase mb-0.5">
            純淨植物力，為你的生活加分
          </p>
          <p className="text-[11px] font-bold text-[#10305a] leading-tight mb-1">{heading}</p>
          <div className="space-y-px">
            {bodyLines.slice(0, 5).map((line, i) => (
              <p key={i} className="text-[7px] text-[#687279] leading-relaxed">{line}</p>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <span className="text-[7px] bg-[#10305a] text-white rounded-full px-2.5 py-0.5">
              {hero.cta_text || "立即選購"}
            </span>
            <span className="text-[7px] border border-[#10305a]/30 text-[#10305a] rounded-full px-2.5 py-0.5">
              了解品牌
            </span>
          </div>
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
  const [carousel, setCarousel] = useState<CarouselItem[]>(DEFAULT_CAROUSEL)
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [savingHero, setSavingHero] = useState(false)
  const [savingBanner, setSavingBanner] = useState(false)
  const [savingCarousel, setSavingCarousel] = useState(false)
  const [savingTestimonials, setSavingTestimonials] = useState(false)
  const [loading, setLoading] = useState(true)
  // new-item inputs
  const [newItemType, setNewItemType] = useState<"image" | "video">("image")
  const [newItemUrl, setNewItemUrl] = useState("")
  const [newItemAlt, setNewItemAlt] = useState("")
  const [newTestimonial, setNewTestimonial] = useState<Testimonial>({ name: "", text: "", rating: 5 })
  const carouselUploadRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      try {
        const [heroRes, bannerRes] = await Promise.all([
          fetch(`${API_URL}/site-contents/homepage_hero`, { credentials: "include" }),
          fetch(`${API_URL}/site-contents/homepage_banner`, { credentials: "include" }),
        ])
        if (heroRes.ok) {
          const json = await heroRes.json()
          // public endpoint returns { data: <value object> }
          const v = json.data ?? {}
          setHero({
            heading: v.heading ?? "",
            subheading: v.subheading ?? "",
            cta_text: v.cta_text ?? "",
            cta_link: v.cta_link ?? "",
            image: v.image ?? "",
            image_scale: v.image_scale ?? 100,
            image_position_x: v.image_position_x ?? 50,
            image_position_y: v.image_position_y ?? 50,
          })
        }
        if (bannerRes.ok) {
          const json = await bannerRes.json()
          const v = json.data ?? {}
          setBanner({ text: v.text ?? "", enabled: v.enabled ?? false })
        }

        // carousel
        const carouselRes = await fetch(`${API_URL}/site-contents/review_carousel`, { cache: "no-store" })
        if (carouselRes.ok) {
          const json = await carouselRes.json()
          if (Array.isArray(json.data) && json.data.length > 0) setCarousel(json.data)
        }

        // testimonials
        const testimonialsRes = await fetch(`${API_URL}/site-contents/testimonials`, { cache: "no-store" })
        if (testimonialsRes.ok) {
          const json = await testimonialsRes.json()
          if (Array.isArray(json.data) && json.data.length > 0) setTestimonials(json.data)
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
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/site-contents/homepage_hero`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ value: hero }),
      })
      if (res.ok) {
        toast.success("Hero 已儲存")
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(`儲存失敗 (${res.status})：${JSON.stringify(err)}`)
      }
    } catch (e) {
      toast.error(`網路錯誤：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSavingHero(false)
    }
  }

  async function saveBanner() {
    setSavingBanner(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/site-contents/homepage_banner`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ value: banner }),
      })
      if (res.ok) {
        toast.success("跑馬燈已儲存")
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(`儲存失敗 (${res.status})：${JSON.stringify(err)}`)
      }
    } catch (e) {
      toast.error(`網路錯誤：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSavingBanner(false)
    }
  }

  async function saveCarousel() {
    setSavingCarousel(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/site-contents/review_carousel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ value: carousel }),
      })
      if (res.ok) toast.success("輪播已儲存")
      else { const e = await res.json().catch(() => ({})); toast.error(`儲存失敗：${JSON.stringify(e)}`) }
    } catch (e) { toast.error(`網路錯誤：${e instanceof Error ? e.message : String(e)}`) }
    finally { setSavingCarousel(false) }
  }

  async function saveTestimonials() {
    setSavingTestimonials(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/site-contents/testimonials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ value: testimonials }),
      })
      if (res.ok) toast.success("評論已儲存")
      else { const e = await res.json().catch(() => ({})); toast.error(`儲存失敗：${JSON.stringify(e)}`) }
    } catch (e) { toast.error(`網路錯誤：${e instanceof Error ? e.message : String(e)}`) }
    finally { setSavingTestimonials(false) }
  }

  async function uploadCarouselMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isVideo = file.type.startsWith("video/")
    const isImage = file.type.startsWith("image/")
    if (!isVideo && !isImage) { toast.error("只接受圖片或影片"); return }
    if (file.size > 50 * 1024 * 1024) { toast.error("檔案大小不能超過 50MB"); return }
    const ext = file.name.split(".").pop()
    const path = `reviews/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from("product-images").upload(path, file)
    if (error) { toast.error(error.message); return }
    const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(path)
    setCarousel(prev => [...prev, { type: isVideo ? "video" : "image", src: publicUrl, alt: file.name }])
    toast.success("已上傳，記得儲存")
    if (carouselUploadRef.current) carouselUploadRef.current.value = ""
  }

  function addCarouselItem() {
    if (!newItemUrl.trim()) return
    setCarousel(prev => [...prev, { type: newItemType, src: newItemUrl.trim(), alt: newItemAlt.trim() || (newItemType === "video" ? "影片" : "圖片") }])
    setNewItemUrl("")
    setNewItemAlt("")
  }

  function moveCarouselItem(i: number, dir: -1 | 1) {
    const arr = [...carousel]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setCarousel(arr)
  }

  function removeCarouselItem(i: number) {
    setCarousel(prev => prev.filter((_, idx) => idx !== i))
  }

  function addTestimonial() {
    if (!newTestimonial.name || !newTestimonial.text) return
    setTestimonials(prev => [...prev, { ...newTestimonial }])
    setNewTestimonial({ name: "", text: "", rating: 5 })
  }

  function updateTestimonial(i: number, field: keyof Testimonial, val: string | number) {
    setTestimonials(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t))
  }

  function removeTestimonial(i: number) {
    setTestimonials(prev => prev.filter((_, idx) => idx !== i))
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
              label="縮放" hint="（數字越小圖越縮）"
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

          {/* Body text — textarea with line-break support */}
          <div className="space-y-1">
            <Label htmlFor="hero-subheading">
              內文
              <span className="ml-1.5 text-xs text-gray-400 font-normal">（每行一段，Enter 換行；留空顯示預設文案）</span>
            </Label>
            <textarea
              id="hero-subheading"
              value={hero.subheading}
              onChange={(e) => setHeroField("subheading", e.target.value)}
              placeholder={"補充體力、維持精神\n身體好吸收、不負擔的營養\n每一天，都多一點力氣與穩定\n身心安然\n回到自在的生活節奏"}
              rows={5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
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

      {/* ── 評論輪播 ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-[#10305a]">使用者回饋輪播（圖片 / 影片）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Item list */}
          <div className="space-y-2">
            {carousel.map((item, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
                <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white border text-[#10305a]">
                  {item.type === "video" ? <Video className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                </span>
                <p className="flex-1 text-xs text-gray-500 truncate">{item.alt || item.src}</p>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => moveCarouselItem(i, -1)} disabled={i === 0} className="p-1 disabled:opacity-30 hover:text-[#10305a]"><MoveUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => moveCarouselItem(i, 1)} disabled={i === carousel.length - 1} className="p-1 disabled:opacity-30 hover:text-[#10305a]"><MoveDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeCarouselItem(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Upload file directly */}
          <div className="rounded-lg border border-dashed border-gray-300 p-3 space-y-2">
            <p className="text-xs font-semibold text-[#10305a]">上傳媒體（圖片或影片，最大 50MB）</p>
            <input ref={carouselUploadRef} type="file" accept="image/*,video/*" onChange={uploadCarouselMedia} className="hidden" />
            <Button type="button" variant="outline" size="sm" onClick={() => carouselUploadRef.current?.click()}>
              選擇檔案上傳
            </Button>
          </div>

          {/* Add by URL */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-[#10305a]">或輸入網址新增</p>
            <div className="flex gap-2">
              <select
                value={newItemType}
                onChange={e => setNewItemType(e.target.value as "image" | "video")}
                className="text-xs rounded border border-input bg-background px-2 py-1.5"
              >
                <option value="image">圖片</option>
                <option value="video">影片</option>
              </select>
              <Input
                value={newItemUrl}
                onChange={e => setNewItemUrl(e.target.value)}
                placeholder="https://..."
                className="text-xs flex-1"
              />
            </div>
            <Input
              value={newItemAlt}
              onChange={e => setNewItemAlt(e.target.value)}
              placeholder="說明文字（選填）"
              className="text-xs"
            />
            <Button type="button" size="sm" variant="outline" onClick={addCarouselItem} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> 新增
            </Button>
          </div>

          <Button onClick={saveCarousel} disabled={savingCarousel} className="bg-[#10305a] hover:bg-[#10305a]/90">
            {savingCarousel ? "儲存中..." : "儲存輪播"}
          </Button>
        </CardContent>
      </Card>

      {/* ── 文字評論 ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-[#10305a]">首頁文字評論</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing testimonials */}
          <div className="space-y-3">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={t.name}
                    onChange={e => updateTestimonial(i, "name", e.target.value)}
                    placeholder="名稱"
                    className="text-xs w-28"
                  />
                  {/* Star rating */}
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} type="button" onClick={() => updateTestimonial(i, "rating", s)}>
                        <Star className={`w-4 h-4 ${s <= t.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => removeTestimonial(i)} className="ml-auto text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                <textarea
                  value={t.text}
                  onChange={e => updateTestimonial(i, "text", e.target.value)}
                  placeholder="評論內容"
                  rows={2}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs resize-y"
                />
              </div>
            ))}
          </div>

          {/* Add new testimonial */}
          <div className="rounded-lg border border-dashed border-gray-300 p-3 space-y-2">
            <p className="text-xs font-semibold text-[#10305a]">新增評論</p>
            <div className="flex items-center gap-2">
              <Input
                value={newTestimonial.name}
                onChange={e => setNewTestimonial(p => ({ ...p, name: e.target.value }))}
                placeholder="名稱"
                className="text-xs w-28"
              />
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <button key={s} type="button" onClick={() => setNewTestimonial(p => ({ ...p, rating: s }))}>
                    <Star className={`w-4 h-4 ${s <= newTestimonial.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={newTestimonial.text}
              onChange={e => setNewTestimonial(p => ({ ...p, text: e.target.value }))}
              placeholder="評論內容"
              rows={2}
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs resize-y"
            />
            <Button type="button" size="sm" variant="outline" onClick={addTestimonial} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> 新增
            </Button>
          </div>

          <Button onClick={saveTestimonials} disabled={savingTestimonials} className="bg-[#10305a] hover:bg-[#10305a]/90">
            {savingTestimonials ? "儲存中..." : "儲存評論"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
