/**
 * 滿額優惠的文案與進度 —— 跑馬燈、商品頁、購物車共用同一份資料
 * （GET /config 的 spendThresholds 滿額折扣 + spendGifts 滿額贈），不寫死金額。
 * 後台改門檻、改折抵金額、換贈品，三個地方一起變。
 *
 * 結帳時「滿額折扣」同類只套用達到的最高一檔（campaigns-evaluator 的
 * pickBestPerType），滿額贈是另一個類型，會跟折扣疊加。所以這裡把兩者混在同一條
 * 階梯上講（客人眼中就是一條由低到高的門檻），但購物車只說「下一個門檻還差多少」，
 * 不去加總金額。
 */

/**
 * 滿額優惠文案前面的活動標語。跑馬燈與商品頁共用，改這一行兩邊一起變。
 * 想換季節主題（例：🎄 聖誕小禮）就改這裡。
 */
export const SPEND_HEADLINE = "周末應援"

export type SpendThreshold = { minAmount: number; discount: number }
export type SpendGift = { minOrder: number; giftName: string; qty?: number }

/** 階梯上的一格：滿 minAmount 可得 reward（「折 100」或「送 帆布環保袋 (大)」）。 */
export type SpendTier = { minAmount: number; reward: string; short: string }

/**
 * 贈品名稱在文案裡要短，而且**不講口味** —— 口味是出貨時決定的，寫進全站文案
 * 會變成對客人的承諾（例：「送初心原味」，客人就會期待一定是原味）。
 *   「初心原味 – 50G隨身包」→「50G隨身包」
 *   「初心原味 – 300克夾鏈袋」→「300克夾鏈袋」
 *   「誠真生活禮袋．帆布環保袋 (大)」→「帆布環保袋 (大)」
 * 破折號前面放口味是商品命名的慣例；沒有破折號的就只去掉品牌前綴。
 */
function shortGiftName(name: string): string {
  const afterDash = name.split(/\s*[–—]\s*/).pop() ?? name
  return afterDash.replace(/^誠真生活禮袋．/, "").trim()
}

/**
 * 送一份以上時要把數量講出來 ——「滿1800送50克隨身包」看起來跟送一包沒兩樣，
 * 客人結帳拿到兩包才發現，等於白白少掉一次「比預期多」的機會。
 * 單位由品名決定：夾鏈袋論袋，其餘論包。送一份時不加（「送50克隨身包1包」很囉嗦）。
 */
function giftQtySuffix(name: string, qty: number | undefined): string {
  if (!qty || qty <= 1) return ""
  return `${qty}${name.includes("袋") ? "袋" : "包"}`
}

/** 折扣 + 贈品合成一條由低到高的階梯。 */
export function spendTiers(thresholds: SpendThreshold[], gifts: SpendGift[] = []): SpendTier[] {
  const fromDiscounts = thresholds
    .filter((t) => t.minAmount > 0 && t.discount > 0)
    .map((t) => ({ minAmount: t.minAmount, reward: `折 ${t.discount}`, short: `折${t.discount}` }))
  const fromGifts = gifts
    .filter((g) => g.minOrder > 0 && g.giftName)
    .map((g) => {
      const name = shortGiftName(g.giftName)
      const suffix = giftQtySuffix(name, g.qty)
      return {
        minAmount: g.minOrder,
        reward: `送 ${name}${suffix}`,
        short: `送${name}${suffix}`,
      }
    })
  return [...fromDiscounts, ...fromGifts].sort((a, b) => a.minAmount - b.minAmount)
}

/** 跑馬燈／商品頁：一句話講完全部門檻。例：「滿2400送帆布環保袋 (大)、滿3600折200」 */
export function marqueeSpendMessage(
  thresholds: SpendThreshold[],
  gifts: SpendGift[] = [],
): string | null {
  const tiers = spendTiers(thresholds, gifts)
  if (tiers.length === 0) return null
  return tiers.map((t) => `滿${t.minAmount}${t.short}`).join("、")
}

export type SpendProgress = {
  /** 已達到的最高一格；一格都沒達到時為 null。 */
  current: SpendTier | null
  /** 下一格；已是最高一格時為 null。 */
  next: SpendTier | null
  /** 距離下一格還差多少；沒有下一格時為 0。 */
  remaining: number
  /** 往下一格的進度百分比（0–100）；已是最高一格時為 100。 */
  pct: number
}

export function spendProgress(
  subtotal: number,
  thresholds: SpendThreshold[],
  gifts: SpendGift[] = [],
): SpendProgress | null {
  const tiers = spendTiers(thresholds, gifts)
  if (tiers.length === 0) return null
  const current = [...tiers].reverse().find((x) => subtotal >= x.minAmount) ?? null
  const next = tiers.find((x) => subtotal < x.minAmount) ?? null
  if (!next) return { current, next: null, remaining: 0, pct: 100 }
  const remaining = next.minAmount - subtotal
  const pct = Math.max(0, Math.min(100, Math.round((subtotal / next.minAmount) * 100)))
  return { current, next, remaining, pct }
}
