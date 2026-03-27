import type { MetadataRoute } from "next"
import { getProducts } from "@/lib/catalog"

const BASE_URL = "https://realreal-rho.vercel.app"

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
    productRoutes = products.map((p) => ({
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
