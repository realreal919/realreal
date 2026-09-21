/**
 * 滿額折扣的文案與進度 —— 跑馬燈和購物車共用同一份資料（GET /config 的
 * spendThresholds），不寫死金額。後台改門檻或折抵金額，兩個地方一起變。
 *
 * 結帳只套用「達到的最高一檔」（campaigns-evaluator 的 pickBestPerType 同類只取
 * 最好的一個），所以這裡講的也是「目前這一檔」與「下一檔」，不會把幾檔加總。
 */

export type SpendThreshold = { minAmount: number; discount: number }

/** 門檻由小到大排好，去掉不合法的。 */
function normalize(tiers: SpendThreshold[]): SpendThreshold[] {
  return tiers
    .filter((t) => t.minAmount > 0 && t.discount > 0)
    .slice()
    .sort((a, b) => a.minAmount - b.minAmount)
}

/** 跑馬燈：一句話講完全部檔次。例：「滿1100折100、滿2000折200、滿5000折600」 */
export function marqueeSpendMessage(tiers: SpendThreshold[]): string | null {
  const t = normalize(tiers)
  if (t.length === 0) return null
  return t.map((x) => `滿${x.minAmount}折${x.discount}`).join("、")
}

export type SpendProgress = {
  /** 已達到的最高一檔；一檔都沒達到時為 null。 */
  current: SpendThreshold | null
  /** 下一檔；已是最高檔時為 null。 */
  next: SpendThreshold | null
  /** 距離下一檔還差多少；沒有下一檔時為 0。 */
  remaining: number
  /** 往下一檔的進度百分比（0–100）；已是最高檔時為 100。 */
  pct: number
}

export function spendProgress(subtotal: number, tiers: SpendThreshold[]): SpendProgress | null {
  const t = normalize(tiers)
  if (t.length === 0) return null
  const current = [...t].reverse().find((x) => subtotal >= x.minAmount) ?? null
  const next = t.find((x) => subtotal < x.minAmount) ?? null
  if (!next) return { current, next: null, remaining: 0, pct: 100 }
  const remaining = next.minAmount - subtotal
  const pct = Math.max(0, Math.min(100, Math.round((subtotal / next.minAmount) * 100)))
  return { current, next, remaining, pct }
}
