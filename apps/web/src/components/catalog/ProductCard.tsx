"use client"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Product } from "@/lib/catalog"

export function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0]
  const isSoldOut = product.total_stock === 0
  const price = product.min_price

  return (
    <Card className="group relative overflow-hidden border hover:shadow-lg transition-all duration-300 cursor-pointer">
      <Link href={`/shop/${product.slug}`} className="block">
        {/* Image */}
        <div className="aspect-[4/5] relative bg-zinc-100 overflow-hidden">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-108"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
              無圖片
            </div>
          )}

          {/* Sold out overlay */}
          {isSoldOut && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Badge variant="destructive" className="text-sm px-3 py-1 font-semibold">
                已售完
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <CardContent className="p-3 space-y-1.5">
          <p className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </p>
          {price != null && price > 0 && (
            <p className="text-sm font-semibold text-zinc-800">
              NT$ {price.toLocaleString()}
            </p>
          )}
        </CardContent>
      </Link>

      {/* Quick add button - visible on hover, hidden when sold out */}
      {!isSoldOut && (
        <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 p-3 pt-0">
          <Button
            size="sm"
            className="w-full text-xs"
            variant="default"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              // Navigate to product page for variant selection
              window.location.href = `/shop/${product.slug}`
            }}
          >
            加入購物車
          </Button>
        </div>
      )}
    </Card>
  )
}
