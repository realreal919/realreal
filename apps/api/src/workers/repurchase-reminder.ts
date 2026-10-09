/**
 * 回購提醒 —— 出貨後第 30 天，每日 10:00（台灣時間）掃一次。
 *
 * 只寄給首購的人，而且只寄一次。挑人的規則在 first-order-mailer.ts，跟回饋信
 * 共用同一套 —— 「誰算首購」只能有一個定義。
 *
 * 管道只做 Email。LINE 要接 Messaging API 並建立每位會員的 LINE user ID 對應，
 * 系統裡沒有那份資料，硬做會讓整個提醒卡在綁定上。
 */
import { Worker, Queue } from "bullmq"
import { Redis } from "ioredis"
import { supabase } from "../lib/supabase"
import { getSetting } from "../lib/settings"
import {
  DEFAULT_COUPON_AMOUNT,
  DEFAULT_COUPON_MIN_ORDER,
  DEFAULT_COUPON_VALID_DAYS,
  DEFAULT_REPURCHASE_DAYS,
  generateCouponCode,
} from "../lib/repurchase-coupon"
import { sweepFirstOrderMail } from "../lib/first-order-mailer"
import { renderAndSendEmail } from "./email-sender"

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

export const repurchaseReminderQueue = new Queue("repurchase-reminder", { connection })

function num(raw: string | null, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export type ReminderSettings = {
  daysAfterShip: number
  couponAmount: number
  couponMinOrder: number
  couponValidDays: number
}

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const [days, amount, minOrder, validDays] = await Promise.all([
    getSetting("repurchase.days_after_ship"),
    getSetting("repurchase.coupon_amount"),
    getSetting("repurchase.coupon_min_order"),
    getSetting("repurchase.coupon_valid_days"),
  ])
  return {
    daysAfterShip: num(days, DEFAULT_REPURCHASE_DAYS),
    couponAmount: num(amount, DEFAULT_COUPON_AMOUNT),
    couponMinOrder: num(minOrder, DEFAULT_COUPON_MIN_ORDER),
    couponValidDays: num(validDays, DEFAULT_COUPON_VALID_DAYS),
  }
}

/** 台灣時間的 YYYY-MM-DD。信上的期限不能用 UTC 切，會差一天。 */
function twDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(d)
}

/**
 * 發一張附專屬優惠碼的回購券。
 *
 * 碼要全站唯一，撞到就換一組再試 —— 靠唯一索引判定，不靠先查一次
 * （兩個人同時被排到會都查到「沒人用」）。
 */
async function issueCoupon(
  userId: string,
  orderId: string,
  settings: ReminderSettings,
  validUntil: Date,
): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCouponCode("RE")
    const { error } = await supabase.from("member_coupons").insert({
      user_id: userId,
      type: "repurchase",
      amount: settings.couponAmount,
      min_order: settings.couponMinOrder,
      code,
      valid_until: validUntil.toISOString(),
      source_order_id: orderId,
    })
    if (!error) return code
    if (!String(error.message).includes("duplicate")) {
      console.warn(`[repurchase-reminder] 建立回購券失敗 user=${userId}:`, error)
      return null
    }
  }
  console.warn(`[repurchase-reminder] 連續 8 次撞號，沒發出回購券 user=${userId}`)
  return null
}

export const repurchaseReminderWorker = new Worker(
  "repurchase-reminder",
  async (job) => {
    if (job.name !== "remind") return

    const now = new Date()
    const settings = await loadReminderSettings()

    return sweepFirstOrderMail({
      days: settings.daysAfterShip,
      reminderType: "auto",
      label: "repurchase-reminder",
      now,
      // 券先發，再寄信。券發不出來就不寄 —— 信上要印優惠碼，寫不出來的信不能寄。
      // 放在 prepare 裡代表失敗時這個人不會被標成「已提醒」，明天還會再試。
      prepare: async (c) => {
        const validUntil = new Date(now)
        validUntil.setDate(validUntil.getDate() + settings.couponValidDays)
        const code = await issueCoupon(c.userId, c.orderId, settings, validUntil)
        if (!code) throw new Error("回購券發放失敗")
        return { code, validUntil }
      },
      send: async (c, { code, validUntil }) => {
        await renderAndSendEmail({
          template: "repurchase-reminder",
          to: c.email,
          data: {
            customerName: c.displayName,
            couponAmount: settings.couponAmount,
            couponMinOrder: settings.couponMinOrder,
            couponCode: code,
            validUntil: twDate(validUntil),
          },
        })
      },
    })
  },
  { connection },
)
