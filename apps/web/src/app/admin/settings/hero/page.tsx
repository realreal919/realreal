"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminTabs } from "../../_components/AdminTabs"
import { SETTINGS_TABS } from "../_tabs"
import {
  HERO_MIN_WIDTH, HERO_RATIO_H, HERO_RATIO_W, heroRatioProblem, heroSlides,
} from "@/lib/hero"
import type { HeroContent } from "@/lib/hero"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
const BUCKET = "product-images"
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

type Slide = { src: string; alt: string }

async function getToken(): Promise<string> {
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token ?? ""
}

/** 讀出圖片的真實尺寸。擋比例要看實際像素，檔名與副檔名都不算數。 */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("這個檔案讀不出圖片尺寸"))
    }
    img.src = url
  })
}

export default function AdminHeroPage() {
  // 整包 homepage_hero 都留著：這個 key 還有 heading／cta 等欄位，
  // 存的時候只換 images，其餘原封不動帶回去。
  const [content, setContent] = useState<HeroContent | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [newAlt, setNewAlt] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/site-contents/homepage_hero`, { cache: "no-store" })
        const value: HeroContent = res.ok ? ((await res.json())?.data ?? {}) : {}
        setContent(value)
        // 沒設定過 images 的站，第一次進來就把目前那張單圖列出來，
        // 不要顯示成「空的」害人以為首頁沒圖。
        setSlides(heroSlides(value))
      } catch {
        toast.error("載入失敗")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function save(next: Slide[]) {
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/site-contents/homepage_hero`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: { ...(content ?? {}), images: next } }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSlides(next)
      toast.success("已儲存，重新整理首頁就會看到")
    } catch {
      toast.error("儲存失敗，請再試一次")
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) { toast.error("只接受圖片檔"); return }
    if (file.size > MAX_UPLOAD_BYTES) { toast.error("檔案不能超過 5MB"); return }

    setUploading(true)
    try {
      const { width, height } = await measure(file)
      const problem = heroRatioProblem(width, height)
      if (problem) { toast.error(problem, { duration: 8000 }); return }
      if (width < HERO_MIN_WIDTH) {
        toast.warning(`這張只有 ${width} px 寬，拉到滿版可能會糊。建議 ${HERO_RATIO_W} px 以上。`)
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
      // 檔名帶日期＋亂數：永遠是新路徑，不會蓋到舊圖，也不會被 CDN 拿舊的回來
      const stamp = new Date().toISOString().slice(0, 10)
      const path = `home/hero-${stamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await createClient().storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
      })
      if (error) { toast.error(`上傳失敗：${error.message}`); return }
      const { data } = createClient().storage.from(BUCKET).getPublicUrl(path)
      await save([...slides, { src: data.publicUrl, alt: newAlt.trim() }])
      setNewAlt("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上傳失敗")
    } finally {
      setUploading(false)
    }
  }

  function move(index: number, dir: -1 | 1) {
    const to = index + dir
    if (to < 0 || to >= slides.length) return
    const next = [...slides]
    const moved = next[index]
    next[index] = next[to]
    next[to] = moved
    void save(next)
  }

  function remove(index: number) {
    if (slides.length === 1) { toast.error("至少要留一張，首頁不能沒有主視覺"); return }
    void save(slides.filter((_, k) => k !== index))
  }

  const busy = saving || uploading

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <AdminTabs tabs={SETTINGS_TABS} />
      <div className="mt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#10305a]">首頁主視覺</h1>
          <p className="mt-1 text-sm text-zinc-500">
            首頁最上面那一塊。兩張以上會自動變成輪播（手機可以用滑的，6 秒換一張）。
          </p>
        </div>

        <div className="rounded-xl border bg-zinc-50/50 p-5 space-y-4">
          <h2 className="font-semibold text-[#10305a]">新增一張</h2>
          <div className="space-y-1">
            <Label htmlFor="new-alt">圖片說明（alt）</Label>
            <Input
              id="new-alt"
              placeholder="圖上有字的話，把那些字寫進來；純情境照留空"
              value={newAlt}
              onChange={(e) => setNewAlt(e.target.value)}
            />
            <p className="text-xs text-zinc-400">
              圖沒載出來時會顯示這行字，螢幕閱讀器也讀它。像檢驗結果這種「圖上才有的資訊」一定要寫。
            </p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              style={{ backgroundColor: "#10305a", color: "#fff" }}
            >
              <Plus className="h-4 w-4 mr-1" />
              {uploading ? "上傳中…" : "選擇圖片上傳"}
            </Button>
            <span className="text-xs text-zinc-500">
              尺寸請用 <strong>{HERO_RATIO_W}×{HERO_RATIO_H}</strong>（或同比例，例如 1920×1080）。
              比例不符會擋下來 —— 輪播每張套同一個框，比例不同的會被裁到字。
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {/* 載入中就先不要報張數 —— 這時候是 0，看起來像「首頁沒有主視覺」。 */}
            <h2 className="font-semibold text-[#10305a]">
              目前{loading ? "" : `（${slides.length} 張）`}
            </h2>
            {busy && <span className="text-xs text-zinc-400">儲存中…</span>}
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-zinc-400">載入中…</div>
          ) : (
            <div className="space-y-3">
              {slides.map((slide, index) => (
                <div key={`${slide.src}-${index}`} className="rounded-xl border bg-background p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="relative shrink-0 w-40 rounded-lg overflow-hidden bg-zinc-100"
                      style={{ aspectRatio: `${HERO_RATIO_W} / ${HERO_RATIO_H}` }}
                    >
                      <Image src={slide.src} alt="" fill sizes="160px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="text-xs text-zinc-400">
                        第 {index + 1} 張{index === 0 && "（首頁一打開先看到這張）"}
                      </div>
                      <Input
                        defaultValue={slide.alt}
                        placeholder="圖片說明（alt）"
                        onBlur={(e) => {
                          const alt = e.target.value.trim()
                          if (alt === slide.alt) return
                          void save(slides.map((s, k) => (k === index ? { ...s, alt } : s)))
                        }}
                      />
                      <div className="truncate text-xs text-zinc-400" title={slide.src}>{slide.src}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button" variant="outline" size="sm"
                      disabled={busy || index === 0} onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4 mr-1" />往前
                    </Button>
                    <Button
                      type="button" variant="outline" size="sm"
                      disabled={busy || index === slides.length - 1} onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4 mr-1" />往後
                    </Button>
                    <Button
                      type="button" variant="outline" size="sm" disabled={busy}
                      onClick={() => remove(index)} className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />刪除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
