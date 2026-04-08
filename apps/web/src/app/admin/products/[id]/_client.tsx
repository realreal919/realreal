"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TiptapEditor } from "@/components/editor"
import { ProductImageUpload } from "@/components/catalog/ProductImageUpload"
import { createClient } from "@/lib/supabase/client"

type Variant = {
  id: string
  name: string
  price: number
  sale_price: number | null
  stock_qty: number
  sku: string | null
}

/** Convert plain text (with \n line breaks) to basic HTML for TiptapEditor */
function toHtml(text: string): string {
  if (!text) return ""
  if (text.includes("<")) return text // already HTML
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map(block => {
      const lines = block.trim().split("\n").filter(Boolean)
      if (lines.length === 0) return ""
      return "<p>" + lines.join("<br>") + "</p>"
    })
    .filter(Boolean)
    .join("\n")
}

export default function AdminProductEditClient({ product }: { product: any }) {
  const router = useRouter()
  const [images, setImages] = useState<string[]>(
    Array.isArray(product.images)
      ? product.images.map((img: any) => (typeof img === "string" ? img : img.url)).filter(Boolean)
      : []
  )
  const [excerpt, setExcerpt] = useState(toHtml(product.excerpt ?? ""))
  const [description, setDescription] = useState(toHtml(product.description ?? ""))
  const [shopLeft, setShopLeft] = useState(product.shop_left ?? "")
  const [shopMiddle, setShopMiddle] = useState(product.shop_middle ?? "")
  const [shopRight, setShopRight] = useState(product.shop_right ?? "")
  const [variants, setVariants] = useState<Variant[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [variantSaving, setVariantSaving] = useState<string | null>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

  async function getToken(): Promise<string> {
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? ""
  }

  useEffect(() => {
    fetch(`${API_URL}/products/${product.id}/variants`)
      .then(r => r.json())
      .then(j => setVariants(j.data ?? []))
      .catch(() => {})
  }, [product.id])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const token = await getToken()

    const imagesPayload = images.map((url, i) => ({ url, alt: "", sort_order: i }))

    const body: Record<string, unknown> = {
      name: fd.get("name") as string,
      slug: fd.get("slug") as string,
      description,
      excerpt,
      shop_left: shopLeft,
      shop_middle: shopMiddle,
      shop_right: shopRight,
      images: imagesPayload,
    }
    try {
      const res = await fetch(`${API_URL}/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        router.push("/admin/products")
      } else {
        const errData = await res.json().catch(() => ({}))
        setSaveError(`儲存失敗 (${res.status})：${JSON.stringify(errData)}`)
      }
    } catch (err) {
      setSaveError(`網路錯誤：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleVariantSave(variant: Variant) {
    setVariantSaving(variant.id)
    const token = await getToken()
    await fetch(`${API_URL}/products/${product.id}/variants/${variant.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        name: variant.name,
        price: variant.price,
        sale_price: variant.sale_price || null,
        stock_qty: variant.stock_qty,
        sku: variant.sku || undefined,
      }),
    })
    setVariantSaving(null)
  }

  function updateVariant(id: string, field: keyof Variant, value: string | number | null) {
    setVariants(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v))
  }

  const fieldClass = "space-y-1"
  const sectionClass = "mt-10 border-t pt-8"

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#10305a" }}>編輯商品</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name & Slug */}
        <div className={fieldClass}>
          <Label htmlFor="name">商品名稱</Label>
          <Input id="name" name="name" defaultValue={product.name} required className="mt-1" />
        </div>
        <div className={fieldClass}>
          <Label htmlFor="slug">網址代碼（英文小寫＋數字＋連字號）</Label>
          <Input id="slug" name="slug" defaultValue={product.slug} pattern="[a-z0-9-]+" required className="mt-1" />
        </div>

        {/* Images */}
        <div className={fieldClass}>
          <Label>商品圖片（可上傳多張，第一張為主圖）</Label>
          <div className="mt-1">
            <ProductImageUpload value={images} onChange={setImages} />
          </div>
        </div>

        {/* Excerpt */}
        <div className={fieldClass}>
          <Label>商品摘要 <span className="text-xs text-gray-400 ml-1">顯示在商品頁右側購買區下方</span></Label>
          <div className="mt-1">
            <TiptapEditor content={excerpt} onChange={setExcerpt} placeholder="簡短說明，例如：五大特色、適合族群…" />
          </div>
        </div>

        {/* Description */}
        <div className={fieldClass}>
          <Label>商品描述 <span className="text-xs text-gray-400 ml-1">僅在無三欄內容時顯示於前台</span></Label>
          <div className="mt-1">
            <TiptapEditor content={description} onChange={setDescription} placeholder="商品整體說明…" />
          </div>
        </div>

        {/* Shop columns — main frontend content */}
        <div className={sectionClass}>
          <h2 className="text-base font-semibold mb-4" style={{ color: "#10305a" }}>
            前台商品詳細內容（三欄）
          </h2>
          <p className="text-xs text-gray-500 mb-4">這三個欄位是前台商品頁下方的主要內容，支援超連結、標題、條列等富文字格式。</p>

          <div className="space-y-6">
            <div className={fieldClass}>
              <Label>左欄 <span className="text-xs text-gray-400 ml-1">特色、功效、使用方式</span></Label>
              <div className="mt-1">
                <TiptapEditor content={shopLeft} onChange={setShopLeft} placeholder="例如：品牌故事、產品特色、使用建議…" />
              </div>
            </div>
            <div className={fieldClass}>
              <Label>中欄 <span className="text-xs text-gray-400 ml-1">成分、規格、營養標示</span></Label>
              <div className="mt-1">
                <TiptapEditor content={shopMiddle} onChange={setShopMiddle} placeholder="例如：全成分表、營養成分、認證標章…" />
              </div>
            </div>
            <div className={fieldClass}>
              <Label>右欄 <span className="text-xs text-gray-400 ml-1">品牌理念、公益、保存方式</span></Label>
              <div className="mt-1">
                <TiptapEditor content={shopRight} onChange={setShopRight} placeholder="例如：品牌故事、公益存款、保存說明…" />
              </div>
            </div>
          </div>
        </div>

        {saveError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 break-all">
            {saveError}
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving} style={{ backgroundColor: "#10305a", color: "#fff" }}>
            {saving ? "儲存中..." : "更新商品資訊"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
        </div>
      </form>

      {/* Variants */}
      {variants.length > 0 && (
        <div className={sectionClass}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#10305a" }}>價格與庫存</h2>
          <div className="space-y-4">
            {variants.map(v => (
              <div key={v.id} className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">規格名稱</Label>
                    <Input className="mt-1" value={v.name} onChange={e => updateVariant(v.id, "name", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">SKU（選填）</Label>
                    <Input className="mt-1" value={v.sku ?? ""} onChange={e => updateVariant(v.id, "sku", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">原價 NT$</Label>
                    <Input type="number" min="0" step="1" className="mt-1" value={v.price}
                      onChange={e => updateVariant(v.id, "price", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-xs">特價 NT$（留空無特價）</Label>
                    <Input type="number" min="0" step="1" className="mt-1" value={v.sale_price ?? ""}
                      onChange={e => updateVariant(v.id, "sale_price", e.target.value ? Number(e.target.value) : null)}
                      placeholder="無特價" />
                  </div>
                  <div>
                    <Label className="text-xs">庫存數量</Label>
                    <Input type="number" min="0" step="1" className="mt-1" value={v.stock_qty}
                      onChange={e => updateVariant(v.id, "stock_qty", Number(e.target.value))} />
                  </div>
                </div>
                <Button type="button" size="sm" disabled={variantSaving === v.id}
                  onClick={() => handleVariantSave(v)}
                  style={{ backgroundColor: "#10305a", color: "#fff" }}>
                  {variantSaving === v.id ? "儲存中..." : "儲存此規格"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
