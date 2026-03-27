import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-zinc-800">404</h1>
      <p className="mt-4 text-lg text-zinc-600">找不到您要的頁面</p>
      <p className="mt-2 text-sm text-zinc-400">您所尋找的頁面可能已被移除或不存在。</p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/"
          className="rounded-md bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
        >
          回到首頁
        </Link>
        <Link
          href="/shop"
          className="rounded-md border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          瀏覽商品
        </Link>
      </div>
    </div>
  )
}
