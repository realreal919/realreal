import { Worker, Queue } from "bullmq"
import { Redis } from "ioredis"
import { sendEmail } from "../lib/email"
import { renderOrderConfirmation } from "../emails/OrderConfirmation"
import { renderPaymentConfirmed } from "../emails/PaymentConfirmed"
import { renderOrderShipped } from "../emails/OrderShipped"
import { renderTierUpgrade } from "../emails/TierUpgrade"

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

export const emailQueue = new Queue("email", { connection })

export type EmailJobData =
  | { template: "order-confirmation"; to: string; data: { orderNumber: string; items: any[]; total: string; address: string } }
  | { template: "payment-confirmed"; to: string; data: { orderNumber: string; amount: string; method: string } }
  | { template: "order-shipped"; to: string; data: { orderNumber: string; trackingNumber: string; carrier: string } }
  | { template: "tier-upgrade"; to: string; data: { newTier: string; discountRate: number; benefits: string[] } }

export const emailWorker = new Worker<EmailJobData>("email", async (job) => {
  const { template, to, data } = job.data

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
    default:
      throw new Error(`Unknown email template: ${(job.data as any).template}`)
  }

  await sendEmail({ to, subject, html })
}, { connection })
