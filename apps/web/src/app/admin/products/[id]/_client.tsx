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

export default function AdminProductEditClient({ product }: { product: any }) {
  const router = useRouter()
  const [images, setImages] = useState<string[]>(product.images ?? [])
  const [description, setDescription] = useState(product.description ?? "")
  const [excerpt, setExcerpt] = useState(product.excerpt ?? "")
  const [variants, setVariants] = useState<Variant[]>([])
  const [saving, setSaving] = useState(false)
  const [variantSaving, setVariantSaving] = useState<string | null>(null)

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

  // Get auth token from Supabase client session
  async function getToken(): Promise<string> {
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? ""
  }

  // Fetch variants on mount
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

    // Convert image URL strings to the object format the API expects
    const imagesPayload = images.map((url, i) => ({ url, alt: "", sort_order: i }))

    const body = {
      name: fd.get("name") as string,
      slug: fd.get("slug") as string,
      description,
      excerpt,
      images: imagesPayload,
    }
    const res = await fetch(`${API_URL}/products/${product.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) router.push("/admin/products")
  }

  async function handleVariantSave(variant: Variant) {
    setVariantSaving(variant.id)
    const token = await getToken()
    await fetch(`${API_URL}/products/${product.id}/variants/${variant.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
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
    setVariants(prev => prev.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    ))
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#10305a" }}>編輯商品</h1>

      {/* Basic info form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <Label htmlFor="name">商品名稱</Label>
          <Input id="name" name="name" defaultValue={product.name} required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="slug">網址代碼（英文小寫+數字+連字號）</Label>
          <Input id="slug" name="slug" defaultValue={product.slug} pattern="[a-z0-9-]+" required className="mt-1" />
        </div>
        <div>
          <Label>商品摘要（簡短說明，支援超連結）</Label>
          <div className="mt-1">
            <TiptapEditor content={excerpt} onChange={setExcerpt} placeholder="輸入商品摘要..." />
          </div>
        </div>
        <div>
          <Label>商品描述（詳細內容，支援超連結）</Label>
          <div className="mt-1">
            <TiptapEditor content={description} onChange={setDescription} placeholder="輸入商品描述..." />
          </div>
        </div>
        <div>
          <Label>商品圖片（可上傳多張，第一張為主圖）</Label>
          <div className="mt-1">
            <ProductImageUpload value={images} onChange={setImages} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} style={{ backgroundColor: "#10305a", color: "#fff" }}>
            {saving ? "儲存中..." : "更新商品資訊"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
        </div>
      </form>

      {/* Variants / Price & Stock */}
      {variants.length > 0 && (
        <div className="mt-10 border-t pt-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#10305a" }}>價格與庫存</h2>
          <div className="space-y-4">
            {variants.map(v => (
              <div key={v.id} className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">規格名稱</Label>
                    <Input
                      className="mt-1"
                      value={v.name}
                      onChange={e => updateVariant(v.id, "name", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">SKU（選填）</Label>
                    <Input
                      className="mt-1"
                      value={v.sku ?? ""}
                      onChange={e => updateVariant(v.id, "sku", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">原價 NT$</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      className="mt-1"
                      value={v.price}
                      onChange={e => updateVariant(v.id, "price", Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">特價 NT$（留空無特價）</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      className="mt-1"
                      value={v.sale_price ?? ""}
                      onChange={e => updateVariant(v.id, "sale_price", e.target.value ? Number(e.target.value) : null)}
                      placeholder="無特價"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">庫存數量</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      className="mt-1"
                      value={v.stock_qty}
                      onChange={e => updateVariant(v.id, "stock_qty", Number(e.target.value))}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={variantSaving === v.id}
                  onClick={() => handleVariantSave(v)}
                  style={{ backgroundColor: "#10305a", color: "#fff" }}
                >
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
