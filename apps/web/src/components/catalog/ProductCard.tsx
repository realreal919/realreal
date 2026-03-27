import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Product } from "@/lib/catalog"

export function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0]

  return (
    <Link href={`/shop/${product.slug}`}>
      <Card className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
        <div className="aspect-square relative bg-zinc-100">
          {image ? (
            <Image src={image} alt={product.name} fill className="object-cover group-hover:scale-105 transition-transform" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">無圖片</div>
          )}
        </div>
        <CardContent className="pt-3 pb-1">
          <p className="font-medium text-sm line-clamp-2">{product.name}</p>
        </CardContent>
        <CardFooter className="pb-3">
          <Badge variant="secondary" className="text-xs">查看詳情</Badge>
        </CardFooter>
      </Card>
    </Link>
  )
}
