/**
 * 首購折 與 會員券（感謝券／回購券）不併用，擇優。
 *
 * 2026-10-12 店主指定。起因是 #10000338：一位 10/9 才註冊、沒買過東西的會員，
 * 10/12 收到「會員制度更新通知」拿到老朋友感謝券，同一天下第一筆單，於是
 * 首購折 50 和感謝券 100 一起生效。首購判定本身沒錯（那確實是她第一筆訂單），
 * 錯在兩者之間沒有任何互斥規則 —— 會員券不走活動評估器，而評估器裡唯一的
 * 互斥組是「首購折 vs 生日禮金」。
 *
 * 平手時留**首購折**，把券留著下次用。兩個金額一樣，這一單客人付的錢相同，
 * 但券還在手上 —— 對客人是「沒有損失」，講得清楚。反過來做的話，券被扣掉、
 * 首購資格也同時用掉（首購一輩子只有一次），客人等於一次失去兩樣東西。
 *
 * 注意：這只管「折扣」。首購禮的不鏽鋼量匙是另一條路（resolveScoopGift，看
 * received_scoop），不受這裡影響 —— 店主要的是折扣擇優，不是取消首購禮。
 */

export type ExclusivityDecision = {
  /** 首購折要不要作廢（從 campaignDiscount 裡扣掉、不標記 first_purchase_applied） */
  dropFirstPurchase: boolean
  /** 會員券要不要作廢（不折抵、不標記已使用，留著下次） */
  dropCoupon: boolean
}

const KEEP_BOTH: ExclusivityDecision = { dropFirstPurchase: false, dropCoupon: false }

export function resolveFirstPurchaseVsCoupon(
  firstPurchaseCents: number,
  couponCents: number,
): ExclusivityDecision {
  // 只有兩邊都真的有金額才需要取捨。其中一邊是 0 的時候不能「作廢」另一邊 ——
  // 那會變成沒有券的人連首購折都拿不到。
  if (firstPurchaseCents <= 0 || couponCents <= 0) return KEEP_BOTH

  // 券比較多 → 用券，首購折作廢。平手留首購折（見檔案開頭）。
  return couponCents > firstPurchaseCents
    ? { dropFirstPurchase: true, dropCoupon: false }
    : { dropFirstPurchase: false, dropCoupon: true }
}
