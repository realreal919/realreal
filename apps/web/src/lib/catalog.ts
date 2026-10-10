const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

export type Category = { id: string; name: string; slug: string; parent_id: string | null; sort_order: number; product_count?: number; children?: Category[] }
export type ProductVariant = { id: string; name: string; price: string; sale_price: string | null; stock_qty: number; sku: string | null; weight?: number | null; attributes: Record<string, unknown> | null }
export type Product = { id: string; name: string; slug: string; description: string | null; excerpt: string | null; images: string[] | null; is_active: boolean; is_featured: boolean; is_addon: boolean; display_priority: number; category_id: string | null; created_at: string; min_price?: number; max_price?: number; min_sale_price?: number | null; per_pack_min_price?: number | null; total_stock?: number; sales_count?: number; min_tier_id?: string | null; min_tier?: { id: string; name: string; min_spend: number } | null; badge_text?: string | null; delist_at?: string | null;
  /** 列表 API 會一併回傳規格（含 attributes）—— 分類頁的系列分組靠它判斷。 */
  variants?: ProductVariant[] | null }

export type SortOption = "featured" | "newest" | "price_asc" | "price_desc" | "best_selling"

export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API_URL}/categories`, { cache: "no-store" })
  if (!res.ok) return []
  const json = await res.json()
  return json.data ?? []
}

export async function getProducts(params?: { page?: number; limit?: number; category?: string; q?: string; sort?: SortOption; featured?: boolean }): Promise<{ data: Product[]; total: number }> {
  const sp = new URLSearchParams()
  if (params?.page) sp.set("page", String(params.page))
  if (params?.limit) sp.set("limit", String(params.limit))
  if (params?.category) sp.set("category", params.category)
  if (params?.q) sp.set("q", params.q)
  if (params?.sort) sp.set("sort", params.sort)
  if (params?.featured) sp.set("featured_only", "true")
  const res = await fetch(`${API_URL}/products?${sp}`, { next: { revalidate: 60 } })
  if (!res.ok) return { data: [], total: 0 }
  return res.json()
}

export async function getProductBySlug(slug: string): Promise<(Product & { variants: ProductVariant[] }) | null> {
  const res = await fetch(`${API_URL}/products/${slug}`, { next: { revalidate: 60 } })
  if (!res.ok) return null
  const json = await res.json()
  return json.data ?? null
}

/**
 * 贈勺規則（GET /config 的 scoopGift）。夾鏈袋商品頁用它決定要不要顯示
 * 「可加購量匙」的引導。
 *
 * 夾鏈袋的清單只有後台設定這一份來源 —— 前台若自己再寫一份，改了一邊另一邊
 * 照舊，提示和實際贈送就會對不上。
 */
export type ScoopGiftConfig = {
  slug: string
  triggerSlugs: string[]
  addonPrice: number | null
}

export async function getScoopGiftConfig(): Promise<ScoopGiftConfig | null> {
  try {
    const res = await fetch(`${API_URL}/config`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    const json = (await res.json()) as { scoopGift?: ScoopGiftConfig | null }
    return json.scoopGift ?? null
  } catch {
    // 拿不到就不顯示那一句。少一句引導沒關係，顯示錯的價格不行。
    return null
  }
}
