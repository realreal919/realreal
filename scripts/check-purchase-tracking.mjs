/**
 * 核對 GA4 的 purchase 事件有沒有跟著真實訂單送出。
 *
 * 背景：2026-10-11 站上改用 gtag.js 之後，purchase 事件一直沒真的送出去
 *（lib/analytics 還是 GTM 的寫法），GA4 的「重要活動」與收益長期是 0。
 * 2026-10-17 修好並部署（commit a348112、4c47317），但修好當下沒有新訂單，
 * 所以還沒被真實交易驗證過。
 *
 * 這支只做第一半：把「修好之後成立的付款訂單」列出來。
 * 第二半要人去 GA4 對：報表 →「生命週期 → 營利 → 電子商務購買」，
 * 或「即時」（只保留 30 分鐘，適合剛下單時看）。
 *
 * 用法（在 apps/api 的環境變數底下跑）：
 *   node scripts/check-purchase-tracking.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY —— 請在 apps/api/.env 的環境下執行")
  process.exit(1)
}

/** purchase 修正部署上線的時間（UTC）。在這之後成立的訂單才「應該」有 GA4 事件。 */
const FIX_DEPLOYED_AT = "2026-10-17T11:10:00Z"

/** 只有真的付了款才會觸發 purchase —— 完成頁要等伺服器回報 payment_status 成功。 */
const PAID_STATUSES = ["paid", "captured"]

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/orders` +
    `?select=order_number,created_at,status,payment_status,payment_method,total` +
    `&created_at=gte.${FIX_DEPLOYED_AT}` +
    `&deleted_at=is.null` +
    `&order=created_at.asc`,
  { headers },
)
if (!res.ok) {
  console.error("查詢失敗：", res.status, await res.text())
  process.exit(1)
}

const orders = await res.json()
const paid = orders.filter((o) => PAID_STATUSES.includes(o.payment_status))

console.log(`修正部署時間（UTC）：${FIX_DEPLOYED_AT}`)
console.log(`之後成立的訂單：${orders.length} 筆，其中已付款：${paid.length} 筆\n`)

if (orders.length === 0) {
  console.log("還沒有新訂單 —— 等下一筆進來再跑一次。")
  process.exit(0)
}

for (const o of orders) {
  const tw = new Date(o.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
  const mark = PAID_STATUSES.includes(o.payment_status) ? "應有 purchase" : "未付款，不該有"
  console.log(
    `  ${o.order_number}  ${tw}  ${o.payment_method}  ` +
      `狀態=${o.status}/${o.payment_status}  NT$${Number(o.total)}  → ${mark}`,
  )
}

if (paid.length > 0) {
  const revenue = paid.reduce((s, o) => s + Number(o.total), 0)
  console.log(`\n到 GA4 對這兩個數字：`)
  console.log(`  purchase 事件數：${paid.length}`)
  console.log(`  收益合計：NT$${revenue}`)
  console.log(`  交易 ID 應該就是訂單編號：${paid.map((o) => o.order_number).join("、")}`)
  console.log(
    `\n注意 GA4 標準報表有數小時延遲；剛下單的話看「即時」報表（只保留 30 分鐘）。`,
  )
}
