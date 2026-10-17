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
  // 安全標頭。2026-10-17 檢查時站上只有 HSTS（Vercel 自己加的），其餘一個都沒有。
  // 這幾個不是防資料外洩，是縱深防禦：萬一哪天有 XSS 或有人把網站嵌進 iframe
  // 做釣魚，這些標頭會先擋一層。
  //
  // 刻意不加 Content-Security-Policy：站上有 gtag.js、Sentry 與 Supabase 的
  // 跨網域請求，CSP 要一條一條白名單，寫錯會整站空白。要加的話得單獨做一輪，
  // 先用 Report-Only 觀察幾天再開。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 不准別的網站把我們嵌進 iframe（點擊劫持）
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // 不要讓瀏覽器自己猜檔案型別（把上傳的圖當成 HTML 執行）
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 跨站連出去時只送網域，不送完整網址（訂單編號之類的不會外流）
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 沒用到的瀏覽器功能一律關掉
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ]
  },

  async redirects() {
    return [
      // 2026-09-21 隨身包 3 入組當天改成 2 入組
      // 2026-09-22 同口味 2 入組下架；盲盒也已下架，舊網址（含更早的 3 入組）改轉到 10 入入門組合。
      // 用 302（permanent: false）：2 入組哪天重新上架，拿掉這兩行就好，瀏覽器不會永久記住。
      { source: "/shop/sachet-3pack", destination: "/shop/protein-10pack-sampler", permanent: false },
      { source: "/shop/sachet-2pack", destination: "/shop/protein-10pack-sampler", permanent: false },

      // 2026-10-17 三個商品網址本來就拼錯字（stawberry 少了 r、vegain、drawgonfruit）。
      // 拼錯的關鍵字對不上 Google 上的搜尋（"strawberry protein" 之類），分享出去也不好看。
      // 用 301（permanent: true）：請搜尋引擎把舊網址的權重轉到新網址，舊連結不會變死連結。
      { source: "/shop/vegan-protein-powder-stawberry", destination: "/shop/vegan-protein-powder-strawberry", permanent: true },
      { source: "/shop/vegain-protein-ses50", destination: "/shop/vegan-protein-ses50", permanent: true },
      { source: "/shop/vegan-protein-powder-almond-drawgonfruit", destination: "/shop/vegan-protein-powder-almond-dragonfruit", permanent: true },
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
