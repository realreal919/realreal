/**
 * GA4 事件。
 *
 * 2026-10-17 改寫：原本是寫給 GTM 的 —— 往 `window.dataLayer` 推一個
 * `{ event: "purchase", ecommerce: {...} }` 物件，由 GTM 容器轉成 GA4 事件。
 * 但 2026-10-11 站上改成直接載入 gtag.js、不經過 GTM（見 components/Analytics.tsx），
 * 而 gtag.js **只認 arguments 形式的指令**（'event', 名稱, 參數），對這種物件
 * 完全視而不見。結果是從 10/11 到 10/17，購買事件一次也沒送到 GA4，
 * 報表上的「重要活動」一直是 0 —— 沒有錯誤訊息，所以從外面看不出來。
 *
 * 兩個地方要一起改才有用：
 *   1. 改用 gtag('event', ...) 送（本檔 emit()）
 *   2. 電商參數要攤平。`items`/`value`/`currency` 直接放在事件參數上，
 *      GTM 時代那層 `ecommerce: {...}` 包裝是 GTM 專用的，gtag.js 會把
 *      整包當成一個無意義的自訂參數丟掉。
 *
 * SSR 安全：每個 helper 都擋 `typeof window === "undefined"`，預算渲染時是 no-op。
 */

type GtagWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

/**
 * 送一個 GA4 事件。
 *
 * 正常情況下 `window.gtag` 在 Analytics.tsx 的 inline script 就定義好了（那支
 * script 比 gtag.js 本體早執行，先把指令排進 dataLayer 佇列），所以這裡幾乎都走
 * 第一條路。第二條是保險：萬一 inline script 還沒跑（afterInteractive），就自己
 * 用同樣的 shim 把 arguments 推進佇列，gtag.js 載入後會照順序補送。
 *
 * 注意 fallback 必須用 `function` 而不是箭頭函式 —— 要的就是它的 `arguments`。
 */
function emit(name: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  const w = window as GtagWindow
  if (typeof w.gtag === "function") {
    w.gtag("event", name, params)
    return
  }
  const queue = (w.dataLayer = w.dataLayer || [])
  function shim() {
    // eslint-disable-next-line prefer-rest-params
    queue.push(arguments)
  }
  ;(shim as (...args: unknown[]) => void)("event", name, params)
}

export interface PurchaseItem {
  sku: string
  name: string
  unit_price: number
  qty: number
}

export interface PurchaseOrder {
  id: string
  total: number
  items: PurchaseItem[]
  kol_slug?: string | null
}

function toGa4Items(items: PurchaseItem[]) {
  return items.map(i => ({
    item_id: i.sku,
    item_name: i.name,
    price: i.unit_price,
    quantity: i.qty,
  }))
}

/**
 * 結帳成功後送出 GA4 `purchase`。呼叫點在 /checkout/confirm，等伺服器回報
 * payment_status 成功才送（不是一進頁面就送，否則偽造的 ?status=success 會灌水）。
 *
 * `value` 要帶訂單實收金額。帶 0 的話 GA4 照樣記一筆轉換，但收益欄是 0，
 * 報表上看起來就像「有人買、但沒有營收」。
 */
export function trackPurchase(order: PurchaseOrder): void {
  emit("purchase", {
    transaction_id: order.id,
    value: order.total,
    currency: "TWD",
    items: toGa4Items(order.items),
    ...(order.kol_slug ? { affiliation: `kol:${order.kol_slug}` } : {}),
  })
}

/** 客人進到 KOL 推薦頁時送出 GA4 `view_promotion`。 */
export function trackKolView(kolSlug: string): void {
  emit("view_promotion", {
    promotion_id: `kol:${kolSlug}`,
    promotion_name: kolSlug,
  })
}

/**
 * 加入購物車。
 *
 * TODO: 尚未接上呼叫點。要接在「加入購物車」的按鈕處理函式，不能接在購物車
 * 水合（hydration）那裡，否則每次重新整理都會多算一次。
 */
export function trackAddToCart(item: PurchaseItem): void {
  emit("add_to_cart", {
    currency: "TWD",
    value: item.unit_price * item.qty,
    items: toGa4Items([item]),
  })
}

/**
 * 進入結帳流程。
 *
 * TODO: 尚未接上呼叫點。接在 /checkout/payment 掛載時，而且要用 useRef 擋成
 * 只送一次 —— 重新渲染或上一步退回來都會重複觸發，漏斗數字會虛胖。
 */
export function trackBeginCheckout(cart: {
  items: PurchaseItem[]
  total: number
}): void {
  emit("begin_checkout", {
    currency: "TWD",
    value: cart.total,
    items: toGa4Items(cart.items),
  })
}
