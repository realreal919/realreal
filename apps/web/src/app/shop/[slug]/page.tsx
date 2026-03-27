import { notFound } from "next/navigation"
import Image from "next/image"
import { getProductBySlug } from "@/lib/catalog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return { title: "商品不存在" }
  return { title: `${product.name} | 誠真生活 RealReal`, description: product.description }
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) notFound()

  const image = product.images?.[0]
  const minPrice = product.variants.length > 0
    ? Math.min(...product.variants.map(v => Number(v.sale_price ?? v.price)))
    : null

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="aspect-square relative bg-zinc-100 rounded-lg overflow-hidden">
          {image
            ? <Image src={image} alt={product.name} fill className="object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-zinc-400">無圖片</div>
          }
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
          {minPrice && <p className="text-xl font-semibold text-zinc-800 mb-4">NT$ {minPrice.toLocaleString()}</p>}
          {product.description && <p className="text-zinc-600 mb-6">{product.description}</p>}
          <div className="space-y-2 mb-6">
            {product.variants.map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="text-sm">{v.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">NT$ {Number(v.sale_price ?? v.price).toLocaleString()}</span>
                  {v.stock_qty === 0 && <Badge variant="destructive" className="text-xs">缺貨</Badge>}
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full" disabled>加入購物車（開發中）</Button>
        </div>
      </div>
    </div>
  )
}
