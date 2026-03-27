import { Router } from "express"
import { supabase } from "../../lib/supabase"
import { verifySignature } from "../../lib/jkopay"

export const jkopayWebhookRouter = Router()

const API_KEY = process.env.JKOPAY_API_KEY ?? ""

// POST /webhooks/jkopay — JKOPay server notification via X-Signature header
jkopayWebhookRouter.post("/", async (req, res) => {
  const rawBody = JSON.stringify(req.body)
  const signature = req.headers["x-signature"] as string

  if (!signature || !verifySignature(rawBody, signature, API_KEY)) {
    res.status(400).json({ error: "Invalid signature" }); return
  }

  const { merchantTradeNo, tradeNo, status } = req.body as Record<string, string>

  if (!merchantTradeNo) {
    res.status(400).json({ error: "Missing merchantTradeNo" }); return
  }

  // Idempotency guard — insert into webhook_events, catch unique constraint "23505"
  const { error: idempotencyError } = await supabase
    .from("webhook_events")
    .insert({
      gateway: "jkopay",
      merchant_trade_no: merchantTradeNo,
      payload: rawBody,
    })

  if (idempotencyError) {
    if (idempotencyError.code === "23505") {
      // Duplicate webhook — already processed
      res.json({ result: "OK" }); return
    }
    console.error("[webhooks/jkopay] idempotency insert failed:", idempotencyError)
    res.status(500).json({ error: "InternalError" }); return
  }

  const success = status === "SUCCESS"

  const { data: tx } = await supabase
    .from("payment_transactions")
    .select("id, order_id")
    .eq("merchant_trade_no", merchantTradeNo)
    .single()

  if (tx) {
    await supabase
      .from("payment_transactions")
      .update({
        status: success ? "captured" : "failed",
        gateway_trade_no: tradeNo ?? null,
        raw_response: rawBody,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tx.id)

    await supabase
      .from("orders")
      .update({ status: success ? "paid" : "payment_failed", updated_at: new Date().toISOString() })
      .eq("id", tx.order_id)
  }

  res.json({ result: "OK" })
})
