import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { getProductBySlug } from "@/lib/catalog"
import { AddToCartSection } from "@/components/product/AddToCartSection"
import { ImageGallery } from "@/components/product/ImageGallery"
import { ReviewForm } from "@/components/product/ReviewForm"
import { createClient } from "@/lib/supabase/server"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

type Review = {
  id: string
  rating: number
  content: string
  author_name: string
  created_at: string
}

function maskName(name: string) {
  if (!name) return "匿名"
  return name.charAt(0) + "***"
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} style={{ color: star <= rating ? "#f59e0b" : "#d1d5db" }}>
          &#9733;
        </span>
      ))}
    </span>
  )
}

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

  const images = product.images ?? []
  const mainImage = images[0]

  // Fetch reviews server-side
  let reviews: Review[] = []
  let averageRating = 0
  let totalCount = 0
  try {
    const reviewsRes = await fetch(`${API_URL}/products/${product.id}/reviews`, { next: { revalidate: 60 } })
    if (reviewsRes.ok) {
      const json = await reviewsRes.json()
      reviews = json.data ?? []
      averageRating = json.averageRating ?? 0
      totalCount = json.totalCount ?? 0
    }
  } catch {
    // API unavailable
  }

  // Check if user is logged in for review form
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token ?? ""

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
          {/* Product image gallery */}
          <ImageGallery images={images} productName={product.name} />

          {/* Product info */}
          <div className="flex flex-col">
            <h1
              className="text-2xl font-bold tracking-tight lg:text-3xl"
              style={{ color: "#10305a", fontFamily: "'Gill Sans', 'Gill Sans MT', sans-serif" }}
            >
              {product.name}
            </h1>

            {/* Star rating */}
            <div className="mt-3 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className="text-lg"
                  style={{ color: star <= Math.round(averageRating) ? "#f59e0b" : "#d1d5db" }}
                >
                  &#9733;
                </span>
              ))}
              <span className="ml-2 text-sm" style={{ color: "#687279" }}>
                ({totalCount > 0 ? averageRating.toFixed(1) : "尚無評價"})
              </span>
            </div>

            <div className="mt-6">
              <AddToCartSection
                productName={product.name}
                variants={product.variants ?? []}
                imageUrl={mainImage ?? undefined}
              />
            </div>

            {/* Short description (if no 3-column content, show as fallback) */}
            {product.description && !product.shop_left && !product.shop_middle && !product.shop_right && (
              <div className="mt-8 border-t border-gray-200 pt-6">
                <h2 className="text-base font-semibold mb-3" style={{ color: "#10305a" }}>商品說明</h2>
                {product.description.includes("<") ? (
                  <div
                    className="prose prose-sm max-w-none text-sm leading-relaxed"
                    style={{ color: "#687279" }}
                    dangerouslySetInnerHTML={{ __html: product.description }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#687279" }}>
                    {product.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 商品三欄 — 3-column product detail section (from WordPress ACF) */}
        {(product.shop_left || product.shop_middle || product.shop_right) && (
          <div className="mt-12 border-t border-gray-200 pt-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
              {/* 商品左欄 — Product features & usage */}
              {product.shop_left && (
                <div>
                  <div
                    className="prose prose-sm max-w-none
                      prose-p:leading-relaxed prose-p:my-3
                      prose-headings:font-semibold prose-headings:text-[#10305a] prose-headings:mt-6 prose-headings:mb-3
                      prose-h4:text-base prose-h5:text-sm
                      prose-ul:pl-5 prose-li:my-1.5 prose-ul:my-3
                      prose-blockquote:border-l-[#10305a] prose-blockquote:bg-gray-50 prose-blockquote:py-3 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:my-4
                      prose-strong:text-[#10305a]"
                    style={{ color: "#687279" }}
                    dangerouslySetInnerHTML={{ __html: product.shop_left }}
                  />
                </div>
              )}
              {/* 商品中欄 — Ingredients, specs, nutrition */}
              {product.shop_middle && (
                <div>
                  <div
                    className="prose prose-sm max-w-none
                      prose-p:leading-relaxed prose-p:my-3
                      prose-headings:font-semibold prose-headings:text-[#10305a] prose-headings:mt-6 prose-headings:mb-3
                      prose-h4:text-base prose-h5:text-sm
                      prose-ul:pl-5 prose-li:my-1.5 prose-ul:my-3
                      prose-strong:text-[#10305a]"
                    style={{ color: "#687279" }}
                    dangerouslySetInnerHTML={{ __html: product.shop_middle }}
                  />
                </div>
              )}
              {/* 商品右欄 — Brand values, charity, storage */}
              {product.shop_right && (
                <div>
                  <div
                    className="prose prose-sm max-w-none
                      prose-p:leading-relaxed prose-p:my-3
                      prose-headings:font-semibold prose-headings:text-[#10305a] prose-headings:mt-6 prose-headings:mb-3
                      prose-h4:text-base prose-h5:text-sm
                      prose-ul:pl-5 prose-li:my-1.5 prose-ul:my-3
                      prose-a:text-[#10305a] prose-a:underline
                      prose-strong:text-[#10305a]"
                    style={{ color: "#687279" }}
                    dangerouslySetInnerHTML={{ __html: product.shop_right }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Reviews Section */}
        <div className="mt-12 border-t border-gray-200 pt-8">
          <h2 className="text-xl font-bold mb-2" style={{ color: "#10305a" }}>商品評價</h2>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl font-bold" style={{ color: "#10305a" }}>
              {totalCount > 0 ? averageRating.toFixed(1) : "-"}
            </span>
            <div>
              <StarRating rating={Math.round(averageRating)} />
              <p className="text-sm" style={{ color: "#687279" }}>
                {totalCount > 0 ? `${totalCount} 則評價` : "尚無評價"}
              </p>
            </div>
          </div>

          {/* Review Form (logged in users only) */}
          {user && token && (
            <div className="mb-8">
              <ReviewForm productId={product.id} token={token} />
            </div>
          )}

          {/* Review Cards */}
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-[10px] border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: "#10305a" }}>
                      {maskName(review.author_name)}
                    </span>
                    <StarRating rating={review.rating} />
                  </div>
                  <span className="text-xs" style={{ color: "#687279" }}>
                    {new Date(review.created_at).toLocaleDateString("zh-TW")}
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "#687279" }}>
                  {review.content}
                </p>
              </div>
            ))}
          </div>

          {reviews.length === 0 && !user && (
            <p className="text-sm text-center py-8" style={{ color: "#687279" }}>
              此商品尚無評價
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
