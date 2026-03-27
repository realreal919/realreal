"use client"
import Image from "next/image"
import Link from "next/link"
import type { Product } from "@/lib/catalog"

export function ProductCard({
  product,
  categoryName,
}: {
  product: Product
  categoryName?: string
}) {
  const image = product.images?.[0]
  const isSoldOut = product.total_stock === 0
  const minPrice = product.min_price
  const maxPrice = product.max_price
  const hasRange = minPrice != null && maxPrice != null && minPrice !== maxPrice
  // Show "特價" badge when there is a price range (variable product with different prices)
  const showSaleBadge =
    hasRange && minPrice != null && maxPrice != null && minPrice < maxPrice

  // Determine if product is "variable" (has price range) or "simple"
  const isVariable = hasRange

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Image */}
      <Link href={`/shop/${product.slug}`} className="block">
        <div className="aspect-square relative bg-zinc-50 overflow-hidden">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
              無圖片
            </div>
          )}

          {/* Sale badge */}
          {showSaleBadge && (
            <div
              className="absolute top-2 left-2 px-2 py-0.5 text-xs font-semibold text-white rounded-sm"
              style={{ backgroundColor: "#10305a" }}
            >
              特價
            </div>
          )}

          {/* Sold out overlay */}
          {isSoldOut && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-sm font-semibold px-3 py-1 bg-red-600 rounded">
                已售完
              </span>
            </div>
          )}
        </div>
      </Link>

      {/* Content */}
      <div className="flex flex-col flex-1 pt-3 pb-2 px-1 gap-1.5">
        {/* Product name */}
        <Link href={`/shop/${product.slug}`}>
          <p
            className="text-sm font-medium leading-snug line-clamp-2"
            style={{ color: "#10305a", fontFamily: "'Gill Sans', 'Gill Sans MT', sans-serif" }}
          >
            {product.name}
          </p>
        </Link>

        {/* Price */}
        {minPrice != null && minPrice > 0 && (
          <p
            className="text-sm font-semibold"
            style={{ color: "#10305a", fontFamily: "'Gill Sans', 'Gill Sans MT', sans-serif" }}
          >
            {hasRange
              ? `NT$${minPrice.toLocaleString()} – NT$${maxPrice!.toLocaleString()}`
              : `NT$${minPrice.toLocaleString()}`}
          </p>
        )}

        {/* Star rating */}
        <div className="flex items-center gap-0.5" style={{ color: "#f59e0b" }}>
          {"★★★★★".split("").map((star, i) => (
            <span key={i} className="text-sm leading-none">
              {star}
            </span>
          ))}
        </div>

        {/* Category tags */}
        {categoryName && (
          <p
            className="text-xs text-zinc-400 leading-snug"
            style={{ fontFamily: "'Gill Sans', 'Gill Sans MT', sans-serif" }}
          >
            ALL, {categoryName}
          </p>
        )}

        {/* Spacer to push button to bottom */}
        <div className="flex-1" />

        {/* Action button */}
        {!isSoldOut && (
          <div className="mt-2">
            {isVariable ? (
              <Link
                href={`/shop/${product.slug}`}
                className="block w-full text-center text-xs font-semibold py-2.5 border rounded-[10px] transition-colors hover:bg-zinc-50"
                style={{
                  color: "#10305a",
                  borderColor: "#10305a",
                  fontFamily: "'Gill Sans', 'Gill Sans MT', sans-serif",
                }}
              >
                選擇規格
              </Link>
            ) : (
              <Link
                href={`/shop/${product.slug}`}
                className="block w-full text-center text-xs font-semibold py-2.5 text-white rounded-[10px] transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: "#10305a",
                  fontFamily: "'Gill Sans', 'Gill Sans MT', sans-serif",
                }}
              >
                加入購物車
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
