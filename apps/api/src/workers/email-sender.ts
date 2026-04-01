/**
 * Email sender — direct send (no BullMQ/Redis required).
 * Templates are rendered to HTML and sent via Gmail SMTP.
 */
import { sendEmail } from "../lib/email"
import { renderOrderConfirmation } from "../emails/OrderConfirmation"
import { renderPaymentConfirmed } from "../emails/PaymentConfirmed"
import { renderOrderShipped } from "../emails/OrderShipped"
import { renderTierUpgrade } from "../emails/TierUpgrade"
import { renderSubscriptionBilled } from "../emails/SubscriptionBilled"
import { renderSubscriptionFailed } from "../emails/SubscriptionFailed"

export type EmailJobData =
  | { template: "order-confirmation"; to: string; data: { orderNumber: string; items: any[]; total: string; address: string } }
  | { template: "payment-confirmed"; to: string; data: { orderNumber: string; amount: string; method: string } }
  | { template: "order-shipped"; to: string; data: { orderNumber: string; trackingNumber: string; carrier: string } }
  | { template: "tier-upgrade"; to: string; data: { newTier: string; discountRate: number; benefits: string[] } }
  | { template: "subscription-billed"; to: string; data: { planName: string; amount: string; nextBillingDate: string; orderNumber: string } }
  | { template: "subscription-failed"; to: string; data: { planName: string; retryDate: string; manageUrl: string } }

/**
 * Render an email template and send it directly via Gmail SMTP.
 * This replaces the old BullMQ worker — no Redis needed.
 */
export async function renderAndSendEmail(jobData: EmailJobData): Promise<void> {
  const { template, to, data } = jobData

  let subject: string
  let html: string

  switch (template) {
    case "order-confirmation":
      subject = `訂單確認 #${data.orderNumber}`
      html = renderOrderConfirmation(data)
      break
    case "payment-confirmed":
      subject = `付款成功 #${data.orderNumber}`
      html = renderPaymentConfirmed(data)
      break
    case "order-shipped":
      subject = `您的訂單已出貨 #${data.orderNumber}`
      html = renderOrderShipped(data)
      break
    case "tier-upgrade":
      subject = `恭喜升級為${data.newTier}！`
      html = renderTierUpgrade(data)
      break
    case "subscription-billed":
      subject = `訂閱扣款成功 — ${data.planName}`
      html = renderSubscriptionBilled(data)
      break
    case "subscription-failed":
      subject = `訂閱扣款失敗 — ${data.planName}`
      html = renderSubscriptionFailed(data)
      break
    default:
      console.error(`[email-sender] Unknown template: ${(jobData as any).template}`)
      return
  }

  await sendEmail({ to, subject, html })
}
