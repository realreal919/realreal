"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TiptapEditor } from "@/components/editor"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

async function getToken(): Promise<string> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ""
}

const PAGE_LABELS: Record<string, string> = {
  about_page: "品牌故事",
  idea_page: "公益里程",
  faq_items: "常見問題",
  footer_social: "社群連結",
  seo_defaults: "SEO 預設",
}

interface FaqItem {
  question: string
  answer: string
}

export default function AdminPageEditorPage() {
  const params = useParams<{ key: string }>()
  const router = useRouter()
  const key = params.key
  const label = PAGE_LABELS[key] ?? key

  const [value, setValue] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`${API_URL}/site-contents/${key}`, { cache: "no-store" })
        if (res.ok) {
          const json = await res.json()
          // public endpoint returns { data: <value> }
          setValue(json.data ?? getDefaultValue(key))
        } else {
          setValue(getDefaultValue(key))
        }
      } catch {
        toast.error("載入資料失敗")
        setValue(getDefaultValue(key))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [key])

  async function handleSave() {
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch(`${API_URL}/admin/site-contents/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ value }),
      })
      if (res.ok) toast.success("已儲存")
      else { const e = await res.json().catch(() => ({})); toast.error(`儲存失敗 (${res.status})`) }
    } catch (e) {
      toast.error(`網路錯誤：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-[#687279]">載入中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => router.push("/admin/pages")}>
          ← 返回
        </Button>
        <h1 className="text-xl font-semibold text-[#10305a]">{label}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-[#10305a]">編輯 {label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {key === "about_page" && (
            <AboutPageEditor value={value} onChange={setValue} />
          )}
          {key === "idea_page" && (
            <AboutPageEditor value={value} onChange={setValue} />
          )}
          {key === "faq_items" && (
            <FaqItemsEditor value={value} onChange={setValue} />
          )}
          {key === "footer_social" && (
            <FooterSocialEditor value={value} onChange={setValue} />
          )}
          {key === "seo_defaults" && (
            <SeoDefaultsEditor value={value} onChange={setValue} />
          )}
          <Button onClick={handleSave} disabled={saving} className="bg-[#10305a] hover:bg-[#10305a]/90">
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function getDefaultValue(key: string) {
  switch (key) {
    case "about_page":
    case "idea_page":
      return { content_html: "" }
    case "faq_items":
      return { items: [] }
    case "footer_social":
      return { instagram: "", facebook: "", line: "" }
    case "seo_defaults":
      return { title_suffix: "", description: "" }
    default:
      return {}
  }
}

function AboutPageEditor({
  value,
  onChange,
}: {
  value: { content_html: string }
  onChange: (v: { content_html: string }) => void
}) {
  return (
    <div className="space-y-1">
      <Label>頁面內容</Label>
      <TiptapEditor
        content={value.content_html}
        onChange={(html) => onChange({ content_html: html })}
        placeholder="輸入關於我們內容..."
      />
    </div>
  )
}

function FaqItemsEditor({
  value,
  onChange,
}: {
  value: { items: FaqItem[] }
  onChange: (v: { items: FaqItem[] }) => void
}) {
  const items = value.items ?? []

  function updateItem(index: number, field: keyof FaqItem, fieldValue: string) {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: fieldValue }
    onChange({ items: updated })
  }

  function addItem() {
    onChange({ items: [...items, { question: "", answer: "" }] })
  }

  function removeItem(index: number) {
    onChange({ items: items.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="rounded-[10px] border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#10305a]">問題 {i + 1}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => removeItem(i)}
            >
              移除
            </Button>
          </div>
          <div className="space-y-1">
            <Label>問題</Label>
            <Input
              value={item.question}
              onChange={(e) => updateItem(i, "question", e.target.value)}
              placeholder="問題標題"
            />
          </div>
          <div className="space-y-1">
            <Label>回答</Label>
            <Input
              value={item.answer}
              onChange={(e) => updateItem(i, "answer", e.target.value)}
              placeholder="回答內容"
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addItem}>
        + 新增問題
      </Button>
    </div>
  )
}

function FooterSocialEditor({
  value,
  onChange,
}: {
  value: { instagram: string; facebook: string; line: string }
  onChange: (v: { instagram: string; facebook: string; line: string }) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="social-instagram">Instagram URL</Label>
        <Input
          id="social-instagram"
          value={value.instagram}
          onChange={(e) => onChange({ ...value, instagram: e.target.value })}
          placeholder="https://instagram.com/..."
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="social-facebook">Facebook URL</Label>
        <Input
          id="social-facebook"
          value={value.facebook}
          onChange={(e) => onChange({ ...value, facebook: e.target.value })}
          placeholder="https://facebook.com/..."
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="social-line">LINE URL</Label>
        <Input
          id="social-line"
          value={value.line}
          onChange={(e) => onChange({ ...value, line: e.target.value })}
          placeholder="https://line.me/..."
        />
      </div>
    </div>
  )
}

function SeoDefaultsEditor({
  value,
  onChange,
}: {
  value: { title_suffix: string; description: string }
  onChange: (v: { title_suffix: string; description: string }) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="seo-title">Title 後綴</Label>
        <Input
          id="seo-title"
          value={value.title_suffix}
          onChange={(e) => onChange({ ...value, title_suffix: e.target.value })}
          placeholder="| 誠真生活"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="seo-desc">預設 Description</Label>
        <Input
          id="seo-desc"
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder="網站描述..."
        />
      </div>
    </div>
  )
}
