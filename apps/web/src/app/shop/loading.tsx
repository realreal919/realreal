import { ProductCardSkeleton } from "@/components/catalog/ProductCardSkeleton"
import { Skeleton } from "@/components/ui/skeleton"

export default function ShopLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Title skeleton */}
      <Skeleton className="h-8 w-32 mb-6" />

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar skeleton - desktop only */}
        <aside className="hidden lg:block w-56 shrink-0">
          <Skeleton className="h-4 w-16 mb-3" />
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        </aside>

        {/* Main content skeleton */}
        <div className="flex-1 min-w-0">
          {/* Mobile category filter skeleton */}
          <div className="lg:hidden flex gap-2 mb-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-20 shrink-0" />
            ))}
          </div>

          {/* Toolbar skeleton */}
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>

          {/* Grid skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
