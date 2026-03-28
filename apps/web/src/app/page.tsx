import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getProducts, getCategories } from "@/lib/catalog"
import type { Product, Category } from "@/lib/catalog"
import { getSiteContent, getPosts } from "@/lib/content"
import type { Post } from "@/lib/content"
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

/* ---------- data fetching ---------- */

async function getProductsByCategory(categorySlug: string): Promise<Product[]> {
  try {
    const { data } = await getProducts({ category: categorySlug, limit: 4 })
    return data
  } catch {
    return []
  }
}

async function findCategorySlug(needle: string): Promise<string | undefined> {
  const categories = await getCategories()
  return categories.find(
    (c: Category) =>
      c.name.includes(needle) || c.slug.includes(needle)
  )?.slug
}

/* ---------- sections ---------- */

type HeroContent = {
  heading?: string
  subheading?: string
  cta_text?: string
  cta_link?: string
}

function HeroSection({ content }: { content?: HeroContent | null }) {
  const heading = content?.heading ?? "自純淨中補給，在誠真中安心"
  const ctaText = content?.cta_text ?? "探索商品"
  const ctaLink = content?.cta_link ?? "/shop"

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#f5f0fa] via-[#f8f4f0] to-[#faf6f2]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[520px] items-center gap-8 py-16 md:grid-cols-2 md:py-20 lg:py-24">
          {/* Left: text */}
          <div className="order-2 md:order-1">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-[#10305a] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.3]">
              {heading}
            </h1>
            <div className="mt-6 space-y-3 text-base leading-relaxed text-[#687279] sm:text-[17px]">
              {content?.subheading ? (
                <p>{content.subheading}</p>
              ) : (
                <>
                  <p>誠真堅持選用非動物來源</p>
                  <p>每一份營養，都來自對生命與土地的尊重。</p>
                  <p>
                    每一口，補進的不只是純真的能量，更是一種安心與純粹的生活態度。
                  </p>
                  <p>回歸自然，也回到自己，致上對身體與生命最深的善意</p>
                  <p className="italic">——愛正活在生活裡。</p>
                </>
              )}
            </div>
            <div className="mt-8">
              <Button
                asChild
                size="lg"
                className="bg-[#10305a] text-white rounded-[10px] px-8 text-base h-12 hover:bg-[#10305a]/90"
              >
                <Link href={ctaLink}>{ctaText}</Link>
              </Button>
            </div>
          </div>

          {/* Right: product / hero image */}
          <div className="relative order-1 flex items-center justify-center md:order-2">
            <Image
              src="/brand/hero-bg.webp"
              alt="誠真生活產品"
              width={600}
              height={500}
              className="object-contain"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function MembershipSection() {
  const tiers = [
    {
      name: "初心之友",
      stars: 1,
      benefits: [
        "常態 95折",
        "消費 2.3% 累積公益存款或購物金",
        "生日 95折 + 公益存款雙倍",
      ],
      qualification: "註冊即可成為",
    },
    {
      name: "知心之友",
      stars: 2,
      benefits: [
        "常態 95折",
        "消費 3.3% 累積公益存款或購物金",
        "生日 9折 + 公益存款雙倍",
        "線上講座參與資格",
      ],
      qualification: "累計消費滿 NT$3,500",
    },
    {
      name: "同心之友",
      stars: 3,
      benefits: [
        "常態 9折",
        "消費 3.3% 累積公益存款或購物金",
        "生日公益存款雙倍 + 專屬生日禮",
        "線上 + 實體活動參與資格",
      ],
      qualification: "累計消費滿 NT$12,000",
    },
  ]

  return (
    <section className="bg-[#fffeee] py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-[#10305a] sm:text-3xl">
          消費額 2.3% 累積公益存款或購物金
        </h2>

        {/* Option A: show the uploaded membership image */}
        <div className="mt-10">
          <Image
            src="/brand/membership-tiers.png"
            alt="會員等級：初心之友、知心之友、同心之友"
            width={1200}
            height={400}
            className="mx-auto w-full max-w-4xl rounded-xl"
          />
        </div>

        {/* Option B: Tailwind tier cards (always rendered below for accessibility / SEO) */}
        <div className="sr-only">
          {tiers.map((tier) => (
            <div key={tier.name}>
              <h3>{tier.name}</h3>
              <ul>
                {tier.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p>{tier.qualification}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductSection({
  title,
  products,
  moreLabel,
  moreHref,
}: {
  title: string
  products: Product[]
  moreLabel: string
  moreHref: string
}) {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-[#10305a] sm:text-3xl">
          {title}
        </h2>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {products.map((product) => {
            const image = product.images?.[0]
            return (
              <Link
                key={product.id}
                href={`/shop/${product.slug}`}
                className="group"
              >
                <Card className="overflow-hidden border-0 shadow-sm hover:shadow-lg transition-shadow duration-300">
                  <div className="aspect-square relative bg-zinc-50 overflow-hidden">
                    {image ? (
                      <Image
                        src={image}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-300 text-sm">
                        無圖片
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <p className="font-medium text-sm text-[#10305a] line-clamp-2">
                      {product.name}
                    </p>
                    {product.min_price != null && product.min_price > 0 && (
                      <p className="mt-1 text-sm font-semibold text-[#687279]">
                        NT$ {product.min_price.toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        {products.length > 0 && (
          <div className="mt-10 text-center">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-[10px] border-[#10305a]/30 text-[#10305a] hover:bg-[#10305a]/5 px-8"
            >
              <Link href={moreHref}>{moreLabel}</Link>
            </Button>
          </div>
        )}

        {products.length === 0 && (
          <p className="mt-10 text-center text-[#687279]">商品即將上架，敬請期待。</p>
        )}
      </div>
    </section>
  )
}

function BlogSection({ posts }: { posts: Post[] }) {
  // Fallback to hardcoded placeholder if no real posts
  const fallbackPosts = [
    {
      title: "植物蛋白vs動物蛋白：你該知道的事",
      excerpt: "了解兩者差異，選擇最適合自己的蛋白質來源。",
    },
    {
      title: "凍乾水果的營養價值完整保留嗎？",
      excerpt: "科學解析凍乾技術如何鎖住水果的天然營養。",
    },
    {
      title: "純素飲食入門指南",
      excerpt: "從日常飲食開始，輕鬆踏上純素生活的第一步。",
    },
  ]

  const hasPosts = posts.length > 0

  return (
    <section className="bg-[#fffeee] py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-[#10305a] sm:text-3xl">
          聰明過生活
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {hasPosts
            ? posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group"
                >
                  <Card className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
                    <div className="aspect-[16/9] relative bg-gradient-to-br from-[#f5f0fa] to-[#faf6f2] overflow-hidden">
                      {post.cover_image ? (
                        <Image
                          src={post.cover_image}
                          alt={post.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#10305a]/20 text-4xl">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                            <path d="M18 14h-8" />
                            <path d="M15 18h-5" />
                            <path d="M10 6h8v4h-8V6Z" />
                          </svg>
                        </div>
                      )}
                      {post.category && (
                        <span className="absolute top-3 left-3 rounded-full bg-[#10305a] px-3 py-1 text-xs font-medium text-white">
                          {post.category}
                        </span>
                      )}
                    </div>
                    <CardContent className="p-5">
                      <h3 className="font-semibold text-[#10305a] line-clamp-2 group-hover:underline">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="mt-2 text-sm text-[#687279] line-clamp-2">
                          {post.excerpt}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))
            : fallbackPosts.map((post) => (
                <Card
                  key={post.title}
                  className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="aspect-[16/9] bg-gradient-to-br from-[#f5f0fa] to-[#faf6f2] flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-[#10305a]/20"
                    >
                      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                      <path d="M18 14h-8" />
                      <path d="M15 18h-5" />
                      <path d="M10 6h8v4h-8V6Z" />
                    </svg>
                  </div>
                  <CardContent className="p-5">
                    <h3 className="font-semibold text-[#10305a] line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="mt-2 text-sm text-[#687279] line-clamp-2">
                      {post.excerpt}
                    </p>
                  </CardContent>
                </Card>
              ))}
        </div>

        {hasPosts && (
          <div className="mt-10 text-center">
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-[10px] border-[#10305a]/30 text-[#10305a] hover:bg-[#10305a]/5 px-8"
            >
              <Link href="/blog">查看更多文章 →</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function ReviewsSection() {
  const reviews = [
    {
      name: "小美",
      text: "喝了一個月的植物蛋白粉，精神變得好多！味道也很好入口，推薦給怕奶味的人。",
    },
    {
      name: "阿凱",
      text: "凍乾水果真的超方便，帶去辦公室當零食，同事都問我在哪裡買的。",
    },
    {
      name: "Jenny",
      text: "很喜歡誠真的理念，買東西還能做公益，而且產品品質真的很好！",
    },
  ]

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-[#10305a] sm:text-3xl">
          顧客好評
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <Card
              key={review.name}
              className="border-0 bg-[#f9f9f6] shadow-sm p-6"
            >
              <div className="flex items-center gap-1 text-yellow-400 text-lg mb-3">
                {"★★★★★"}
              </div>
              <p className="text-sm leading-relaxed text-[#687279] italic">
                &ldquo;{review.text}&rdquo;
              </p>
              <p className="mt-4 text-sm font-semibold text-[#10305a]">
                — {review.name}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- page ---------- */

export default async function HomePage() {
  // Resolve category slugs for the two product sections
  const [proteinSlug, fruitSlug] = await Promise.all([
    findCategorySlug("蛋白"),
    findCategorySlug("凍乾"),
  ])

  // Fetch products, content and blog posts in parallel
  const [proteinProducts, fruitProducts, heroContent, blogResult] =
    await Promise.all([
      getProductsByCategory(proteinSlug ?? "protein"),
      getProductsByCategory(fruitSlug ?? "freeze-dried"),
      getSiteContent<HeroContent>("homepage_hero"),
      getPosts({ limit: 3 }),
    ])

  return (
    <main className="min-h-screen">
      {/* 1. Hero */}
      <HeroSection content={heroContent} />

      {/* 2. Membership tiers */}
      <MembershipSection />

      {/* 3. Product section: 純植物蛋白粉 */}
      <ProductSection
        title="純植物蛋白粉"
        products={proteinProducts}
        moreLabel="查看更多植物蛋白 →"
        moreHref={`/shop${proteinSlug ? `?category=${proteinSlug}` : ""}`}
      />

      {/* 4. Product section: 原相凍乾水果 */}
      <div className="bg-[#fffeee]">
        <ProductSection
          title="原相凍乾水果"
          products={fruitProducts}
          moreLabel="查看更多凍乾水果 →"
          moreHref={`/shop${fruitSlug ? `?category=${fruitSlug}` : ""}`}
        />
      </div>

      {/* 5. Blog section */}
      <BlogSection posts={blogResult.data} />

      {/* 6. Customer reviews */}
      <ReviewsSection />
    </main>
  )
}
