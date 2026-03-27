import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = { title: "搜尋商品" }

type Product = {
  id: string
  name: string
  slug: string
  base_price: string
  description: string | null
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  let products: Product[] = []

  if (q) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
      const res = await fetch(`${apiUrl}/products?search=${encodeURIComponent(q)}&limit=40`, {
        next: { revalidate: 0 },
      })
      if (res.ok) {
        const body = await res.json()
        products = body.data ?? []
      }
    } catch {
      // API unavailable
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search form */}
      <form action="/search" method="GET" className="mb-8">
        <div className="mx-auto flex max-w-lg gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="搜尋商品..."
            className="flex-1 rounded-md border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <Button type="submit">搜尋</Button>
        </div>
      </form>

      {/* Results */}
      {!q ? (
        <p className="text-center text-zinc-400">輸入關鍵字搜尋商品</p>
      ) : products.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg text-zinc-500">找不到「{q}」的相關商品</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/shop">瀏覽全部商品</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-zinc-500">
            「{q}」的搜尋結果（{products.length} 件）
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/shop/${p.slug}`}
                className="group rounded-lg border p-3 transition-shadow hover:shadow-md"
              >
                <div className="mb-2 aspect-square rounded-md bg-zinc-100" />
                <p className="text-sm font-medium group-hover:text-green-700">{p.name}</p>
                <p className="mt-1 text-sm font-semibold text-green-700">
                  NT$ {Number(p.base_price).toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
