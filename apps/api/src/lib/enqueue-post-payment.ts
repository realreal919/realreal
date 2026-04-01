import { supabase } from "./supabase"
import { emailQueue } from "../workers/email-sender"
import { invoiceQueue } from "../workers/invoice-issuer"
import { inventoryQueue } from "./queue"
import { incrementSpendAndUpgrade } from "./tier"
// Side-effect import: starts the logistics Worker so it can process create-shipment jobs
import "../workers/logistics-creator"

/**
 * After a successful payment, enqueue the confirmation email, invoice, and
 * logistics (shipment creation) jobs. Also updates the user's total_spend,
 * checks for membership tier upgrade, and accumulates charity_savings.
 * Shared across all payment gateway webhooks (PChomePay, LINE Pay, JKOPay).
 */
export async function enqueuePostPaymentJobs(orderId: string) {
  // Fetch order details needed for the email
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, total, shipping_address, guest_email, user_id, order_items(*), users(email)")
    .eq("id", orderId)
    .single()

  if (!order) {
    console.warn(`[enqueue-post-payment] order ${orderId} not found, skipping jobs`)
    return
  }

  // 0) Update total_spend, check tier upgrade, accumulate charity_savings
  if (order.user_id) {
    try {
      await incrementSpendAndUpgrade(order.user_id, Number(order.total))
    } catch (err) {
      console.warn("[enqueue-post-payment] tier upgrade failed (non-fatal):", err)
    }
  }

  // Resolve recipient: registered user email or guest checkout email
  const userEmail = (order.users as any)?.email as string | undefined
  const recipientEmail = userEmail ?? (order as any).guest_email as string | undefined

  // 1) Enqueue confirmation email
  if (recipientEmail) {
    await emailQueue.add("email", {
      template: "payment-confirmed",
      to: recipientEmail,
      data: {
        orderNumber: order.order_number,
        amount: String(order.total),
        method: "", // gateway-specific; kept generic here
      },
    })
  } else {
    console.warn(`[enqueue-post-payment] no email for order ${orderId}, skipping email`)
  }

  // 2) Create an invoice record (if not already present) and enqueue
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("order_id", orderId)
    .single()

  if (existingInvoice) {
    // Invoice row already exists — just enqueue the issuing job
    await invoiceQueue.add(
      "issue",
      { invoiceId: existingInvoice.id },
      { attempts: 5, backoff: { type: "exponential", delay: 60000 } },
    )
  } else {
    // Create a pending invoice row, then enqueue
    const { data: newInvoice } = await supabase
      .from("invoices")
      .insert({
        order_id: orderId,
        amount: order.total,
        tax_amount: 0,
        status: "pending",
        type: "b2c",
        carrier_type: "member",
      })
      .select("id")
      .single()

    if (newInvoice) {
      await invoiceQueue.add(
        "issue",
        { invoiceId: newInvoice.id },
        { attempts: 5, backoff: { type: "exponential", delay: 60000 } },
      )
    }
  }

  // 3) Enqueue shipment creation via ECPay logistics
  await inventoryQueue.add(
    "create-shipment",
    { orderId },
    { attempts: 3, backoff: { type: "exponential", delay: 30000 } },
  )
}
