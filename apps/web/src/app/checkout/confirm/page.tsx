import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = { title: "訂單成立 | 誠真生活 RealReal" }

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const { order } = await searchParams
  const orderNumber = order ?? "—"

  return (
    <div className="container mx-auto px-4 py-16 max-w-md text-center">
      <div className="text-5xl mb-4">✓</div>
      <h1 className="text-2xl font-bold mb-2">訂單已成立！</h1>
      <p className="text-zinc-500 mb-6">感謝您的購買，我們將盡快為您處理。</p>

      <div className="p-4 bg-zinc-50 rounded-lg mb-8">
        <p className="text-sm text-zinc-500 mb-1">訂單編號</p>
        <p className="font-mono font-semibold text-lg">{orderNumber}</p>
      </div>

      <div className="space-y-3">
        <Link href="/my-account/orders" className="block">
          <Button className="w-full">查看我的訂單</Button>
        </Link>
        <Link href="/" className="block">
          <Button variant="outline" className="w-full">繼續購物</Button>
        </Link>
      </div>
    </div>
  )
}
