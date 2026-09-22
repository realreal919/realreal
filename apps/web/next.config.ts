import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "realreal.cc" },
      { protocol: "https", hostname: "www.realreal.cc" },
      { protocol: "https", hostname: "*.realreal.cc" },
    ],
  },
  // 改過網址的商品：舊網址轉到新網址。商品頁的資料快取在 API 回 404 時不會更新，
  // 舊網址會一直顯示改名前的內容與價格，所以不能等它自己過期。
  async redirects() {
    return [
      // 2026-09-21 隨身包 3 入組當天改成 2 入組
      // 2026-09-22 同口味 2 入組下架；盲盒也已下架，舊網址（含更早的 3 入組）改轉到 10 入入門組合。
      // 用 302（permanent: false）：2 入組哪天重新上架，拿掉這兩行就好，瀏覽器不會永久記住。
      { source: "/shop/sachet-3pack", destination: "/shop/protein-10pack-sampler", permanent: false },
      { source: "/shop/sachet-2pack", destination: "/shop/protein-10pack-sampler", permanent: false },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: false,
  },
})
