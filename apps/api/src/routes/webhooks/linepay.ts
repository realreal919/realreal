import { Router } from "express"
import { supabase } from "../../lib/supabase"
import { confirmPayment } from "../../lib/linepay"

export const linepayWebhookRouter = Router()

// GET /webhooks/linepay/confirm?transactionId=&orderId= — LINE Pay redirects browser here after payment
linepayWebhookRouter.get("/confirm", async (req, res) => {
  const { transactionId, orderId } = req.query as { transactionId: string; orderId: string }

  if (!transactionId || !orderId) {
    res.status(400).json({ error: "Missing transactionId or orderId" }); return
  }

  // Idempotency guard
  const { error: idempotencyError } = await supabase
    .from("webhook_events")
    .insert({
      gateway: "linepay",
      merchant_trade_no: `confirm_${transactionId}`,
      payload: JSON.stringify(req.query),
    })

  if (idempotencyError) {
    if (idempotencyError.code === "23505") {
      // Already confirmed — redirect as success
      res.redirect(`/checkout/result?gateway=linepay&success=true&trade=${transactionId}`); return
    }
    console.error("[webhooks/linepay] idempotency insert failed:", idempotencyError)
    res.redirect(`/checkout/result?gateway=linepay&success=false`); return
  }

  // Look up the payment transaction by gateway_trade_no (transactionId)
  const { data: tx } = await supabase
    .from("payment_transactions")
    .select("id, order_id, amount_cents")
    .eq("gateway_trade_no", transactionId)
    .single()

  if (!tx) {
    res.redirect(`/checkout/result?gateway=linepay&success=false`); return
  }

  try {
    await confirmPayment(transactionId, tx.amount_cents)

    await supabase
      .from("payment_transactions")
      .update({ status: "captured", updated_at: new Date().toISOString() })
      .eq("id", tx.id)

    await supabase
      .from("orders")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", tx.order_id)

    res.redirect(`/checkout/result?gateway=linepay&success=true&trade=${transactionId}`)
  } catch (err) {
    console.error("[webhooks/linepay] confirm failed:", err)

    await supabase
      .from("payment_transactions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", tx.id)

    await supabase
      .from("orders")
      .update({ status: "payment_failed", updated_at: new Date().toISOString() })
      .eq("id", tx.order_id)

    res.redirect(`/checkout/result?gateway=linepay&success=false`)
  }
})

// GET /webhooks/linepay/cancel?orderId= — user cancelled payment
linepayWebhookRouter.get("/cancel", async (req, res) => {
  const { orderId } = req.query as { orderId: string }

  if (orderId) {
    await supabase
      .from("orders")
      .update({ status: "payment_failed", updated_at: new Date().toISOString() })
      .eq("id", orderId)
  }

  res.redirect("/checkout/payment?error=cancelled")
})
