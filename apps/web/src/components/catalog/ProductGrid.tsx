import { ProductCard } from "./ProductCard"
import type { Product } from "@/lib/catalog"

export function ProductGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-zinc-100 p-6 mb-4">
          <svg className="w-10 h-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>
        <p className="text-lg font-medium text-zinc-700 mb-1">找不到商品</p>
        <p className="text-sm text-muted-foreground">試試其他分類或關鍵字吧</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card overflow-hidden">
          <div className="aspect-[4/5] bg-zinc-200 animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-4 bg-zinc-200 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-zinc-200 rounded animate-pulse w-1/2" />
            <div className="h-4 bg-zinc-200 rounded animate-pulse w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
