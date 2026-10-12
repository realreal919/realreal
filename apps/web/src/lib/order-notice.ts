/**
 * 訂單完成頁的「接下來會發生什麼」說明。文案由店主提供（2026-10-12）。
 *
 * 分支看的是**取貨方式**，不是付款方式 —— 這是原本的 bug：確認頁只分
 * 「超商取貨付款」和「其他」，所以線上付款又選超商取貨的客人，整頁看不到
 * 「要等簡訊、要去門市拿」這件事。
 *
 * 唯一由付款方式決定的是最後一步要不要付錢：超商取貨付款要當場給店員，
 * 線上已付款的不用再付。所以 isCod 只影響第 4 點和結語。
 *
 * 出貨天數統一講 2–5 個工作天（跟常見問題、付款完成通知信一致）。刻意把
 * 「出貨」和「送達」分成兩件事講 —— 原本寫「包裹寄至超商（約 3–5 個工作天）」
 * 會被讀成「下單後 3–5 天就會到超商」，但實際上那是出貨時間，後面還要加運送。
 */

export type OrderNotice = {
  title: string
  steps: string[]
  closing: string
}

const SHIP_AND_MAIL = [
  "我們會於 2–5 個工作天內備貨並出貨（不含例假日）。",
  "商品出貨後，我們會寄送出貨通知信至您的電子信箱。",
]

const CVS_ARRIVAL = "商品抵達指定超商後，請留意超商簡訊通知，並於期限內完成取貨。"

const CVS_PREPAID: OrderNotice = {
  title: "訂單處理與取貨說明",
  steps: [
    ...SHIP_AND_MAIL,
    CVS_ARRIVAL,
    "取貨時無須再次付款，請依通知確認取貨資訊即可。",
  ],
  closing: "感謝您的耐心訂購，請留意取貨通知，別讓期待已久的滋養在超商等太久囉！",
}

const CVS_COD: OrderNotice = {
  title: "訂單處理與取貨付款說明",
  steps: [
    ...SHIP_AND_MAIL,
    CVS_ARRIVAL,
    "取貨時請向店員支付訂單金額，付款方式依超商規定辦理。",
  ],
  closing: "感謝您的訂購，請留意取貨通知，別讓期待已久的滋養在超商等太久囉！",
}

const HOME_DELIVERY: OrderNotice = {
  title: "訂單處理與配送說明",
  steps: [
    ...SHIP_AND_MAIL,
    "商品將配送至您填寫的收件地址，請留意物流配送通知並保持聯絡方式暢通。",
    "若配送時無人收件，請依物流業者通知安排後續配送。",
  ],
  closing: "感謝您的訂購，期待誠真的日常滋養，陪伴您與家人好好生活。",
}

const CVS_METHODS = new Set(["cvs_711", "cvs_family"])

/**
 * 回傳要顯示的說明；沒有對應文案時回 null（整塊不顯示）。
 *
 * 寧可不顯示也不要套錯一份：
 *   - 港澳（overseas_cod）是順豐運費到付，上面三份都沒講到「要付運費給快遞」，
 *     套宅配那份會漏掉最關鍵的一句。等店主給文案再加。
 *   - shippingMethod 還沒載入（null）時也回 null，畫面先空著，載到再出現。
 *     這裡寧可晚半秒出現，也不要先顯示一份可能是錯的。
 *
 * paymentMethod 是 cvs_cod 時一律用取貨付款那份，不管 shippingMethod 讀到了沒 ——
 * 取貨付款本來就只有超商取貨，這樣頁面一進來就有說明可看。
 */
export function orderNotice(
  shippingMethod: string | null | undefined,
  paymentMethod: string | null | undefined,
): OrderNotice | null {
  if (paymentMethod === "cvs_cod") return CVS_COD
  if (!shippingMethod) return null
  if (CVS_METHODS.has(shippingMethod)) return CVS_PREPAID
  if (shippingMethod === "home_delivery") return HOME_DELIVERY
  return null
}
