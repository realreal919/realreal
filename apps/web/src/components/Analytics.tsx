"use client"

import Script from "next/script"

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
 * dataLayer 仍然初始化：lib/analytics 的事件推送是寫給 dataLayer 的，gtag.js
 * 本身也用同一個陣列，所以那些既有的事件程式碼不用改。
 */
export function Analytics({ measurementId }: { measurementId?: string | null }) {
  // 開發與預覽環境不送，免得把測試行為混進正式報表
  if (!measurementId || process.env.NODE_ENV !== "production") return null

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
            gtag('config', '${measurementId}');
          `,
        }}
      />
    </>
  )
}
