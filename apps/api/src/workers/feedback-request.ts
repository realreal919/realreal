/**
 * 使用回饋信 —— 出貨後第 14 天，每日 10:30（台灣時間）。
 *
 * 跟回購提醒錯開半小時，不是為了避開尖峰，而是為了讓同一天如果兩封都該寄的
 * 人（理論上不會，14 和 30 差很遠）不會在同一分鐘收到兩封信。
 *
 * 只寄給首購的人、只寄一次。挑人的規則跟回購提醒共用 first-order-mailer。
 */
import { Worker, Queue } from "bullmq"
import { Redis } from "ioredis"
import { getSetting } from "../lib/settings"
import { DEFAULT_FEEDBACK_DAYS } from "../lib/repurchase-coupon"
import { sweepFirstOrderMail } from "../lib/first-order-mailer"
import { ensureReferralCode, loadReferralSettings } from "../lib/referral-service"
import { renderAndSendEmail } from "./email-sender"

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

export const feedbackRequestQueue = new Queue("feedback-request", { connection })

export const feedbackRequestWorker = new Worker(
  "feedback-request",
  async (job) => {
    if (job.name !== "ask") return

    const raw = Number(await getSetting("feedback.days_after_ship"))
    const days = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_FEEDBACK_DAYS
    const referral = await loadReferralSettings()

    return sweepFirstOrderMail({
      days,
      reminderType: "feedback",
      label: "feedback-request",
      send: async (c) => {
        // 配不到推薦碼時信裡只留「登入領取」的連結，不印一個空白的碼
        const referralCode = await ensureReferralCode(c.userId).catch(() => null)
        await renderAndSendEmail({
          template: "feedback-request",
          to: c.email,
          data: {
            customerName: c.displayName,
            referralCode,
            referralMinOrder: referral.minOrder,
            referralReward: referral.refereeReward,
          },
        })
      },
    })
  },
  { connection },
)
