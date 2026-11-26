import { getSetting } from "./settings"

type ShippingMethod = "home_delivery" | "cvs_711" | "cvs_family" | "overseas_cod"

/**
 * Computes the shipping fee (in dollars) for a given shipping method and
 * subtotal, honoring runtime-editable settings:
 *
 *   shipping.fee_home_delivery / shipping.fee_cvs            — base fee
 *   shipping.free_threshold_home / shipping.free_threshold_cvs — free over X
 *   shipping.free_threshold_cvs_family — 全家專屬門檻（取貨與取貨付款共用）
 *   shipping.step_threshold_cvs_711 / shipping.step_fee_cvs_711
 *       — 7-11 的階梯：滿 N 元起運費降為 M 元（還沒到免運門檻的那一段）。
 *         取貨與取貨付款共用這一組，全家與宅配不適用。
 *
 * When the threshold is 0 (or unset), free shipping is disabled.
 */
export type ShippingRule = {
  fee: number
  free_threshold: number
  /**
   * 階梯運費：滿 `at` 元起，運費降為 `fee` 元。由低到高排序。
   *
   * 只描述「還沒到免運門檻」的那一段 —— 免運先判（見 computeShipping），所以
   * 設在免運門檻之上的階梯永遠輪不到。沒有階梯時這個欄位不存在，/config 的
   * JSON 與既有前台的行為就完全不變。
   */
  steps?: Array<{ at: number; fee: number }>
}

/**
 * 讀出一個階梯，順便把設錯的擋掉。
 *
 * 兩種設法是錯的，而且錯的方向都會傷到客人或店家：
 *   - 門檻 >= 免運門檻：永遠輪不到（免運先判），留著只會讓後台以為它在生效。
 *   - 階梯運費 >= 原運費：買更多反而更貴。
 * 兩種都當作「沒有這一階」，退回原本的單一運費 —— 那是加這個功能之前的行為，
 * 設定寫壞時至少不會收錯錢。
 */
async function readStep(
  thresholdKey: string,
  feeKey: string,
  baseFee: number,
  freeThreshold: number,
  fallback: { at: number; fee: number },
): Promise<Array<{ at: number; fee: number }> | undefined> {
  const rawAt = await getSetting(thresholdKey)
  const rawFee = await getSetting(feeKey)
  // 設定讀不到（例如 Supabase 停權那次全部回 null）就用現行政策當退路，
  // 跟免運門檻的退路同一個理由：掉線時講的、收的至少還是對的數字。
  const at = rawAt == null ? fallback.at : Number(rawAt)
  const fee = rawFee == null ? fallback.fee : Number(rawFee)
  if (!Number.isFinite(at) || !Number.isFinite(fee)) return undefined
  if (at <= 0) return undefined
  if (freeThreshold > 0 && at >= freeThreshold) return undefined
  if (fee >= baseFee) return undefined
  return [{ at, fee }]
}

export async function getShippingRule(
  method: ShippingMethod,
  paymentMethod?: string,
): Promise<ShippingRule> {
  // 海外到付：運費由司機收取，線上顯示 0
  if (method === "overseas_cod") return { fee: 0, free_threshold: 0 }

  const isCod =
    (method === "cvs_711" || method === "cvs_family") && paymentMethod === "cvs_cod"

  // 全家：免運門檻跟著「哪一家超商」走，不跟著付款方式走。
  //
  // 2026-11-26 店主定案：7-11 取貨滿 999 免運、滿 699 運費減為 40（階梯見下方），
  // 全家與宅配滿 1500。全家的店到店成本比
  // 7-11 高，但客人眼中兩家是同一件事，所以差別只能出現在門檻上 —— 取貨與取貨
  // 付款共用同一個數字，不然同一家超商會出現兩個免運標準，客服解釋不完。
  //
  // 運費本身沒有分家（兩家都讀 fee_cvs / fee_cvs_cod），只有門檻分。
  if (method === "cvs_family") {
    const fee = Number(
      (await getSetting(isCod ? "shipping.fee_cvs_cod" : "shipping.fee_cvs")) ?? "80",
    )
    const threshold = Number(
      (await getSetting("shipping.free_threshold_cvs_family")) ?? "1500",
    )
    return { fee, free_threshold: threshold }
  }

  // 超商取貨付款（代收貨款）：使用專屬費率，滿專屬門檻同樣享免運。
  //
  // 階梯也適用 —— 店主 2026-11-26 指定「7-11 取貨付款的運費也是 40」。階梯是
  // 「7-11 的」而不是「7-11 取貨的」，兩種付款方式讀同一組設定鍵。全家不吃
  // （它在上面那個分支就回去了）。
  if (isCod) {
    const fee = Number((await getSetting("shipping.fee_cvs_cod")) ?? "80")
    const threshold = Number((await getSetting("shipping.free_threshold_cvs_cod")) ?? "999")
    const codSteps = await readStep(
      "shipping.step_threshold_cvs_711",
      "shipping.step_fee_cvs_711",
      fee,
      threshold,
      { at: 699, fee: 40 },
    )
    return codSteps
      ? { fee, free_threshold: threshold, steps: codSteps }
      : { fee, free_threshold: threshold }
  }

  const isHome = method === "home_delivery"
  const feeKey = isHome ? "shipping.fee_home_delivery" : "shipping.fee_cvs"
  const thresholdKey = isHome
    ? "shipping.free_threshold_home"
    : "shipping.free_threshold_cvs"

  // 運費的退路也要分家：宅配 150、超商 80，跟 SETTING_DEFAULTS 一致。兩者共用
  // 一行 "80" 的話，設定讀不到時宅配會少收 70 —— 跟下面門檻那件事同一類問題，
  // 平常看不出來（資料庫有值），只有掉線時才現形。
  const fee = Number((await getSetting(feeKey)) ?? (isHome ? "150" : "80"))
  // 7-11 的退路是 999、宅配是 1500 —— 跟 SETTING_DEFAULTS 一致。原本 7-11 寫 "0"
  // （等於「沒有免運」），Supabase 停權那次 getSetting 全部回 null，前台就顯示
  // 成完全沒有免運門檻。退路寫成現行政策，至少掉線時講的還是對的數字。
  const threshold = Number(
    (await getSetting(thresholdKey)) ?? (isHome ? "1500" : "999"),
  )

  // 階梯只給 7-11（店主 2026-11-26 指定：滿 699 運費 40、滿 999 免運，取貨與
  // 取貨付款都算）。取貨付款在上面那個分支讀同一組鍵；這裡處理的是取貨。
  // 宅配與全家不在範圍內 —— 要擴到別的方式就各自加一組設定鍵，不要讓一組鍵
  // 悄悄適用到沒談過的通路。
  const steps =
    method === "cvs_711"
      ? await readStep(
          "shipping.step_threshold_cvs_711",
          "shipping.step_fee_cvs_711",
          fee,
          threshold,
          { at: 699, fee: 40 },
        )
      : undefined

  return steps
    ? { fee, free_threshold: threshold, steps }
    : { fee, free_threshold: threshold }
}

/**
 * 由「規則 + 金額」算出運費。**這段邏輯只能有這一份。**
 *
 * 加階梯運費時發現 POST /orders/preview 自己抄了一份舊判斷（比一次免運門檻、
 * 否則收 rule.fee），沒有看 steps。800 元的 7-11 取貨於是在結帳頁顯示 NT$80、
 * 實際下單收 NT$40 —— 顯示與實收不一致。抄一份的代價就是這個，所以 preview
 * 與 computeShipping 都呼叫這裡。
 *
 * 純函式（不讀設定），呼叫端已經拿著規則時就不必為了算運費再查一次。
 */
export function feeForSubtotal(rule: ShippingRule, subtotal: number): number {
  // 免運先判，再看階梯 —— 階梯講的是「還沒免運的那一段」。
  if (rule.free_threshold > 0 && subtotal >= rule.free_threshold) return 0
  // 由低到高掃過，取最後一個達到的 —— 達到多階時給最便宜的那個（最高那一階）。
  let fee = rule.fee
  for (const step of rule.steps ?? []) {
    if (subtotal >= step.at) fee = step.fee
  }
  return fee
}

export async function computeShipping(
  method: ShippingMethod,
  subtotal: number,
  paymentMethod?: string,
): Promise<number> {
  return feeForSubtotal(await getShippingRule(method, paymentMethod), subtotal)
}

/**
 * 三種運費級距：cvs 超商取貨、cvsCod 超商取貨付款、home 宅配。
 *
 * 「超商取貨」與「超商取貨付款」的差別在**付款方式**（cvs_cod），不是運送方式
 * —— 兩者的 shipping_method 都是 cvs_711 / cvs_family。任何要區分這兩者的地方
 * 都得同時看付款方式，所以把判斷收在這裡一次，免得各處自己拼、拼錯一個就變成
 * 給錯免運。
 */
export type ShippingBucket = "cvs" | "cvsCod" | "home" | "overseas"

export function shippingBucket(
  method: string | null | undefined,
  paymentMethod?: string | null,
): ShippingBucket {
  if (method === "overseas_cod") return "overseas"
  const isCvs = method === "cvs_711" || method === "cvs_family"
  if (isCvs) return paymentMethod === "cvs_cod" ? "cvsCod" : "cvs"
  return "home"
}
