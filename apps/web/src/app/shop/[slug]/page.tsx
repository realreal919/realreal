import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { getProductBySlug } from "@/lib/catalog"
import { AddToCartSection } from "@/components/product/AddToCartSection"

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

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-1 text-sm" style={{ color: "#687279" }}>
          <Link href="/" className="transition-colors hover:opacity-70">
            首頁
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/shop" className="transition-colors hover:opacity-70">
            商品
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium" style={{ color: "#10305a" }}>{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
          {/* Product image */}
          <div className="aspect-square relative bg-gray-50 rounded-xl overflow-hidden">
            {image ? (
              <Image
                src={image}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: "#687279" }}>
                無圖片
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl" style={{ color: "#10305a" }}>
              {product.name}
            </h1>

            {/* Star rating */}
            <div className="mt-3 flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-yellow-400 text-lg">&#9733;</span>
              ))}
              <span className="ml-2 text-sm" style={{ color: "#687279" }}>(5.0)</span>
            </div>

            <div className="mt-6">
              <AddToCartSection
                productName={product.name}
                variants={product.variants}
                imageUrl={image ?? undefined}
              />
            </div>

            {/* Description */}
            {product.description && (
              <div className="mt-8 border-t border-gray-200 pt-6">
                <h2 className="text-base font-semibold mb-3" style={{ color: "#10305a" }}>商品說明</h2>
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#687279" }}>
                  {product.description}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
