/**
 * 清掉某筆訂單的「已累積消費」記號，讓後台的「補算消費與點數」可以重跑。
 *
 * 舊版的付款後流程是「先蓋記號、才跑累積」，中間失敗就留下一個假的已完成記號，
 * 之後任何重試都會被跳過，消費永遠補不回來（10000065 就是，記號蓋在
 * 2026-07-21，但該會員的累計消費是 0）。
 *
 * 這支只把 order_post_payment_log.tier_incremented_at 清成 null，不直接改任何
 * 金額 —— 清完之後請到後台按「補算消費與點數」，由正式流程去算消費、公益存款
 * 與等級，數字才不會是手算的。
 *
 * 用法：
 *   node scripts/admin/reset-post-payment-sentinel.mjs 10000065
 *   node scripts/admin/reset-post-payment-sentinel.mjs 10000065 --apply
 */
import { sb, APPLY } from "./_sb.mjs"

const orderNumbers = process.argv.slice(2).filter((a) => !a.startsWith("--"))
if (orderNumbers.length === 0) {
  console.error("請給至少一個訂單編號，例如：node scripts/admin/reset-post-payment-sentinel.mjs 10000065")
  process.exit(1)
}

const orders = await sb(
  `/orders?select=id,order_number,payment_status,status,total,user_id&order_number=in.(${orderNumbers.join(",")})`,
)
if (orders.length === 0) {
  console.error("查無這些訂單：", orderNumbers.join(", "))
  process.exit(1)
}

console.log(APPLY ? "── 實際寫入 ──" : "── 試算（沒有 --apply，不會寫入）──")
for (const o of orders) {
  const log = await sb(`/order_post_payment_log?select=order_id,tier_incremented_at&order_id=eq.${o.id}`)
  const stamp = log[0]?.tier_incremented_at ?? null
  if (!stamp) {
    console.log(" ", o.order_number, "沒有記號，不需要處理")
    continue
  }
  if (APPLY) {
    await sb(`/order_post_payment_log?order_id=eq.${o.id}`, {
      method: "PATCH",
      body: JSON.stringify({ tier_incremented_at: null }),
    })
  }
  console.log(" ", o.order_number, o.payment_status, "金額", Math.round(o.total), "｜記號", String(stamp).slice(0, 10), "→ 清除")
}
console.log(APPLY ? "完成。接著到後台按一次「補算消費與點數」。" : "（試算）")
