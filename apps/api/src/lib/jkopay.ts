import { createHmac, timingSafeEqual } from "crypto"

// JKOPay Online Payment API — https://developer.jkopay.com/
// NOTE: JKOPay does NOT support recurring / token payments. For subscriptions, use PChomePay only.

const STORE_ID = process.env.JKOPAY_STORE_ID ?? ""
const API_KEY = process.env.JKOPAY_API_KEY ?? ""

const BASE_URL = process.env.JKOPAY_SANDBOX === "true"
  ? "https://uat-api.jkopay.com"
  : "https://api.jkopay.com"

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const computed = createHmac("sha256", secret).update(payload).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

export async function initiatePayment(
  orderId: string,
  amount: number
): Promise<{ paymentUrl: string; merchantTradeNo: string }> {
  const merchantTradeNo = `RRJ${Date.now()}`
  const siteUrl = process.env.SITE_URL ?? "https://realreal.cc"

  const bodyObj = {
    storeID: STORE_ID,
    merchantTradeNo,
    currency: "TWD",
    totalPrice: amount,
    orderDesc: `realreal.cc 訂單 ${orderId.slice(0, 8)}`,
    returnURL: `${siteUrl}/webhooks/jkopay/result`,
    notifyURL: `${siteUrl}/webhooks/jkopay`,
  }
  const payload = JSON.stringify(bodyObj)
  const signature = createHmac("sha256", API_KEY).update(payload).digest("hex")

  const response = await fetch(`${BASE_URL}/order/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Store-ID": STORE_ID,
      "X-Signature": signature,
    },
    body: payload,
  })
  const data = await response.json() as Record<string, any>
  if (!data.paymentURL) {
    throw new Error(`JKOPay error: ${JSON.stringify(data)}`)
  }
  return { paymentUrl: data.paymentURL as string, merchantTradeNo }
}
