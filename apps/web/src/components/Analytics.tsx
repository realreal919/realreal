"use client"

import Script from "next/script"
import { usePathname } from "next/navigation"
import { useEffect } from "react"

/**
 * GA4 埋設。
 *
 * 2026-10-11 改寫：原本只支援 GTM（GTM-XXXXXXX），而 ID 讀自建置時烘進去的
 * NEXT_PUBLIC_GTM_ID。那個環境變數從來沒設過，所以這個元件一直回傳 null —— 站上
 * 從頭到尾沒有任何流量紀錄，而且沒有任何地方看得出來。
 *
 * 現在直接吃 GA4 的評估 ID（G-XXXXXXXXXX），不經過 GTM：
 *   - 店主原本在 WordPress 用的就是評估 ID，手上沒有 GTM 容器
 *   - 要的只是流量數字，多一層 GTM 只是多一個會設定錯的地方
 *
 * ID 從 GET /config 讀（由 layout 取得後傳進來），不是環境變數 —— 這樣店主在
 * 後台改 ID 就會生效，不必重新部署。
 *
 * 2026-10-17 補上 traffic_type：後台頁面被算進流量了（7 天內「訂單管理」42 次、
 * 「訂單詳情」36 次、「我的帳戶」35 次，佔總瀏覽近一成），那全是店主自己在工作。
 * 進到 /admin 就把這次載入標記成內部流量，GA4 的「內部流量」資料篩選器會濾掉。
 *
 * 標記之後**不解除**：店主從後台逛回前台，那也不是客人的瀏覽行為，整個分頁
 * 一起排除才乾淨。而且 gtag 的自動瀏覽追蹤是在 history 變更當下就送出，比 React
 * 的 effect 早一步 —— 真要在離開 /admin 時解除，反而會把那一筆真實的前台瀏覽
 * 標成內部而丟掉。寧可多排除店主自己，不要誤殺客人。
 */

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void }

const isAdminPath = (path: string | null | undefined) => Boolean(path?.startsWith("/admin"))

export function Analytics({ measurementId }: { measurementId?: string | null }) {
  const pathname = usePathname()
  const enabled = Boolean(measurementId) && process.env.NODE_ENV === "production"

  // 前台→後台是用戶端換頁，inline script 不會重跑，所以這裡補標記。
  useEffect(() => {
    if (!enabled || !isAdminPath(pathname)) return
    const w = window as GtagWindow
    w.gtag?.("set", { traffic_type: "internal" })
  }, [enabled, pathname])

  // 開發與預覽環境不送，免得把測試行為混進正式報表
  if (!enabled) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga4-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            if (location.pathname.indexOf('/admin') === 0) {
              gtag('set', { traffic_type: 'internal' });
            }
            gtag('config', '${measurementId}');
          `,
        }}
      />
    </>
  )
}
