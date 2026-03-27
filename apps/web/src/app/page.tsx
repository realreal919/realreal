import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "誠真生活 RealReal — 純淨植物力，為你的健康加分",
  description:
    "誠真生活是台灣在地純素健康食品品牌，嚴選天然植物原料，堅持無添加、無負擔，為你帶來純粹的植物營養。",
  openGraph: {
    title: "誠真生活 RealReal",
    description: "純淨植物力，為你的健康加分",
    type: "website",
  },
}

/* ---------- types ---------- */

interface Product {
  id: string
  name: string
  price: number
  image?: string
  slug?: string
}

/* ---------- data fetching ---------- */

async function getFeaturedProducts(): Promise<Product[]> {
  try {
    const res = await fetch(
      process.env.NEXT_PUBLIC_API_URL + "/products?limit=8",
      { next: { revalidate: 60 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : data.data ?? []
  } catch {
    return []
  }
}

/* ---------- sections ---------- */

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-green-200/30 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-teal-200/20 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900 sm:text-6xl lg:text-7xl">
            誠真生活
          </h1>
          <p className="mt-4 text-2xl font-medium text-green-800 sm:text-3xl">
            純淨植物力，為你的健康加分
          </p>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-600">
            我們嚴選天然植物原料，堅持無添加、無負擔的健康理念，為台灣家庭帶來最純粹的純素健康食品。從產地到餐桌，每一步都用心把關。
          </p>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="bg-green-700 hover:bg-green-800 text-white rounded-full px-8 text-base h-12"
            >
              <Link href="/shop">探索商品</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturedProducts({ products }: { products: Product[] }) {
  if (products.length === 0) return null

  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          精選商品
        </h2>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <Card
              key={product.id}
              className="overflow-hidden border-0 shadow-sm hover:shadow-lg transition-shadow duration-300"
            >
              <div className="aspect-square bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-4xl text-green-300">🌿</span>
                )}
              </div>
              <CardContent className="p-4">
                <p className="font-medium text-sm text-zinc-800 line-clamp-2">
                  {product.name}
                </p>
                <p className="mt-1 text-sm font-semibold text-green-700">
                  NT${product.price}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-full px-8 border-green-300 text-green-800 hover:bg-green-50"
          >
            <Link href="/shop">查看全部商品</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

function BrandValues() {
  const values = [
    { title: "純淨原料", description: "嚴選天然植物成分" },
    { title: "科學配方", description: "營養師專業調配" },
    { title: "永續包裝", description: "環保可回收材質" },
    { title: "在地生產", description: "台灣製造品質保證" },
  ]

  return (
    <section className="bg-gradient-to-b from-green-50/50 to-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((item) => (
            <Card
              key={item.title}
              className="border-0 bg-white/80 shadow-sm text-center p-8"
            >
              <h3 className="text-xl font-semibold text-zinc-900">
                {item.title}
              </h3>
              <p className="mt-2 text-zinc-600">{item.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function SubscriptionCTA() {
  return (
    <section className="bg-green-800 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            定期配送，健康不間斷
          </h2>
          <p className="mt-4 text-lg text-green-100 leading-relaxed">
            選擇訂閱方案，享受專屬優惠與免運費服務。讓純淨植物營養定期送到你家，輕鬆養成每日健康好習慣，不再擔心斷貨。
          </p>
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="bg-white text-green-800 hover:bg-green-50 rounded-full px-8 text-base h-12 font-semibold"
            >
              <Link href="/subscribe">了解訂閱方案</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- page ---------- */

export default async function HomePage() {
  const products = await getFeaturedProducts()

  return (
    <main className="min-h-screen">
      <HeroSection />
      <FeaturedProducts products={products} />
      <BrandValues />
      <SubscriptionCTA />
    </main>
  )
}
