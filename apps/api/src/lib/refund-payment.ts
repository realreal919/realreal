import { supabase } from "./supabase"
import { sendEmail, parseRecipients } from "./email"
import { getSettingOrEnv } from "./settings"

/**
 * Refund an order's payment.
 *
 * Spec: docs/superpowers/specs/2026-05-30-order-state-transitions-and-cancellation.md
 * (Section 3 — `lib/refund-payment.ts`)
 *
 * V1 behaviour:
 *  1. Mark the row in `payments` for this order as `refund_requested`
 *     (only flips rows where money actually moved — see REFUNDABLE_STATUSES).
 *  2. Send a notification e-mail to the admin address configured in
 *     `notifications.admin_email` (falls back to `ADMIN_EMAIL` env var)
 *     so a human knows to issue the actual refund in the gateway's portal.
 *
 * V1 deliberately does NOT call the gateway's refund API. The cancel
 * endpoint must keep moving even if the refund step is just a "todo" —
 * admins will hit the gateway dashboard manually. The TODO block below
 * is the hook for the future per-provider switch.
 */
/**
 * 「錢真的收到了」的付款狀態 —— 只有這些需要退。
 *
 * 2026-10-13 修的 bug：原本比對的是 `succeeded`，但這個系統從來沒寫過那個字。
 * payments 實際只有四種狀態：captured(195)、pending(104)、failed(21)、paid(2)。
 * 所以那行 UPDATE 從上線到現在**一筆都沒更新到** —— 訂單標成「已退款」，
 * payments 卻還停在 captured，後台也就看不到任何待退款的紀錄，整件事只剩一封
 * 寄給管理員的信。#10000307（LINE Pay 670 元）就是這樣，客人帳單上的扣款還在。
 *
 * pending 不含在內：那是超商取貨付款，錢還沒收，沒有東西好退。
 * failed 也不含：根本沒扣款成功。
 */
const REFUNDABLE_STATUSES = ["captured", "paid", "succeeded"] as const

/** 沙盒訂單沒有真的金流可退，標了只會在待辦清單上製造假的工作。 */
const SANDBOX_GATEWAYS = ["test", "test_paid"]

export async function refundPayment(
  order: {
    id: string
    payment_method?: string | null
    total?: number | string | null
    gateway_tx_id?: string | null
  },
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  // 1) Mark payments as refund_requested so admin lists / reports reflect
  //    the pending refund. 只動「錢真的收到了」的那幾種狀態。
  const { data: flagged, error: paymentsError } = await supabase
    .from("payments")
    .update({ status: "refund_requested" })
    .eq("order_id", order.id)
    .in("status", REFUNDABLE_STATUSES as unknown as string[])
    .not("gateway", "in", `(${SANDBOX_GATEWAYS.join(",")})`)
    .select("id")

  if (paymentsError) {
    return {
      ok: false,
      message: `更新付款記錄失敗：${paymentsError.message}`,
    }
  }

  // 一筆都沒標到就要講出來。原本的寫法悄悄地什麼都沒做，退款這種事沉默失敗
  // 等於客人的錢卡在那裡沒人知道。
  const flaggedCount = (flagged ?? []).length
  if (flaggedCount === 0) {
    console.warn(
      `[refund-payment] order ${order.id}: 沒有任何付款紀錄被標記為待退款`
      + `（可能本來就沒收到錢，或狀態不在 ${REFUNDABLE_STATUSES.join("/")} 之內）`,
    )
  }

  // 2) Notify admin so the actual refund happens in the gateway dashboard.
  //    Non-fatal — if the email blows up we still return ok=true because
  //    the DB flag is set; admin will see it in the orders list.
  try {
    const adminEmails = parseRecipients(
      await getSettingOrEnv("notifications.admin_email", "ADMIN_EMAIL"),
    )
    if (adminEmails.length > 0) {
      const subject = `[退款待處理] 訂單 ${order.id} 已取消`
      const html = `
        <div style="font-family: -apple-system, sans-serif; max-width:600px;">
          <h2 style="color:#10305a;margin:0 0 8px">退款待處理</h2>
          <p style="color:#687279;margin:0 0 24px">訂單已取消，請至對應金流後台手動退款。</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <tr><td style="padding:6px 0;color:#687279;width:120px">訂單編號</td><td style="font-family:monospace;font-weight:600">${order.id}</td></tr>
            <tr><td style="padding:6px 0;color:#687279">金流</td><td>${order.payment_method ?? "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#687279">金額</td><td style="font-weight:600;color:#10305a">NT$ ${order.total != null ? Number(order.total) : "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#687279;vertical-align:top">取消原因</td><td style="white-space:pre-line">${reason}</td></tr>
          </table>
        </div>
      `
      await sendEmail({ to: adminEmails, subject, html })
    } else {
      console.warn(
        `[refund-payment] no admin email configured, skipping notification for order ${order.id}`,
      )
    }
  } catch (err) {
    console.warn(
      `[refund-payment] admin notification failed (non-fatal) for order ${order.id}:`,
      err,
    )
  }

  return {
    ok: true,
    message: flaggedCount > 0
      ? `已標記 ${flaggedCount} 筆退款請求，請至金流後台手動操作`
      : "沒有需要退款的付款紀錄（未收到款或已處理）",
  }

  // TODO future: per-provider real refund API.
  // switch (order.payment_method) {
  //   case "pchomepay": return refundPchome(order.gateway_tx_id, order.total)
  //   case "linepay":   return refundLinepay(order.gateway_tx_id, order.total)
  //   case "jkopay":    return refundJkopay(order.gateway_tx_id, order.total)
  // }
}
