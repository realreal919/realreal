import type { MetadataRoute } from "next"
import { getProducts } from "@/lib/catalog"

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/shop`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/subscribe`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/auth/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/auth/register`, changeFrequency: "monthly", priority: 0.3 },
  ]

  let productRoutes: MetadataRoute.Sitemap = []
  try {
    const { data: products } = await getProducts({ limit: 1000 })
    // 列表 API 已經擋掉不公開商品，這裡再擋一次 —— sitemap 等於把網址主動送給
    // Google，萬一哪天 API 的預設行為改了，這支是最不該漏的一道。
    productRoutes = products
      .filter((p) => !p.is_unlisted)
      .map((p) => ({
        url: `${BASE_URL}/shop/${p.slug}`,
        lastModified: new Date(p.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
  } catch {
    // If the API is unavailable, return only static routes
  }

  return [...staticRoutes, ...productRoutes]
}
