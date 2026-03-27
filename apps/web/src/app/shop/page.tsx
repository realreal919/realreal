import { Suspense } from "react"
import { getCategories, getProducts } from "@/lib/catalog"
import { ProductGrid } from "@/components/catalog/ProductGrid"
import { CategoryFilter } from "@/components/catalog/CategoryFilter"

export const metadata = { title: "商品列表 | 誠真生活 RealReal" }

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }) {
  const { category, q, page } = await searchParams
  const [categories, { data: products }] = await Promise.all([
    getCategories(),
    getProducts({ category, q, page: page ? Number(page) : 1, limit: 24 }),
  ])

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">商品列表</h1>
      <Suspense>
        <CategoryFilter categories={categories} />
      </Suspense>
      <div className="mt-6">
        <ProductGrid products={products} />
      </div>
    </div>
  )
}
