import { Suspense } from "react"
import { getCategories, getProducts } from "@/lib/catalog"
import type { SortOption } from "@/lib/catalog"
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/ProductGrid"
import { CategoryFilter } from "@/components/catalog/CategoryFilter"
import { SortSelect } from "@/components/catalog/SortSelect"
import { Pagination } from "@/components/catalog/Pagination"

export const metadata = {
  title: "商品目錄",
  description: "瀏覽誠真生活 RealReal 全系列純素健康食品，找到最適合您的天然營養選擇。",
}

const PAGE_SIZE = 24

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string; sort?: string }>
}) {
  const { category, q, page, sort } = await searchParams
  const currentPage = page ? Number(page) : 1
  const sortOption = (sort as SortOption) || "newest"

  const [categories, { data: products, total }] = await Promise.all([
    getCategories(),
    getProducts({ category, q, page: currentPage, limit: PAGE_SIZE, sort: sortOption }),
  ])

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">商品列表</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar on desktop */}
        <aside className="hidden lg:block w-56 shrink-0">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            商品分類
          </h2>
          <Suspense>
            <CategoryFilter categories={categories} layout="sidebar" />
          </Suspense>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Mobile horizontal category filter */}
          <div className="lg:hidden mb-4">
            <Suspense>
              <CategoryFilter categories={categories} layout="horizontal" />
            </Suspense>
          </div>

          {/* Toolbar: count + sort */}
          <div className="flex items-center justify-between mb-4 gap-4">
            <p className="text-sm text-muted-foreground shrink-0">
              共 <span className="font-semibold text-foreground">{total}</span> 件商品
            </p>
            <Suspense>
              <SortSelect />
            </Suspense>
          </div>

          {/* Product grid */}
          <Suspense fallback={<ProductGridSkeleton />}>
            <ProductGrid products={products} />
          </Suspense>

          {/* Pagination */}
          <Suspense>
            <Pagination
              total={total}
              pageSize={PAGE_SIZE}
              currentPage={currentPage}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
