/**
 * 計量勺贈品：第一次買夾鏈袋商品時送一支。
 *
 * 規則（2026-10-07 店主定案，兩次修訂後的版本）：
 *   1. 觸發條件是「這張訂單有夾鏈袋商品」，不是金額門檻 —— 隨身包是單份包裝，
 *      本來就不需要勺子。
 *   2. 判斷依據是「這位會員還沒拿過勺」，不是「這是不是第一張訂單」。舊會員
 *      沒拿過的，回購時一樣要送。
 *
 * 為什麼夾鏈袋商品用「設定裡的 slug 清單」而不是比對名稱：組合包改過名字
 * （「任選口味 | 300克夾鏈袋5入組」→「穩定補給 | 任選5袋30天份」），名稱裡
 * 已經沒有「夾鏈袋」或「300克」。靠名稱比對的那套在出貨單上出過事 —— 改名
 * 當天整個組合包從出貨單上消失，而且沒有任何錯誤訊息。slug 不隨行銷文案變動，
 * 新增商品時在後台設定頁加一筆就好，不必重新部署。
 */

export type ScoopCartItem = {
  product_slug?: string | null
  qty: number
}

export type ScoopGiftInput = {
  enabled: boolean
  /** 會觸發送勺的商品 slug（夾鏈袋系列） */
  triggerSlugs: string[]
  items: ScoopCartItem[]
  /** user_profiles.received_scoop */
  alreadyReceived: boolean
  /** 訪客結帳沒有會員身分，無從判斷拿過沒有 */
  isMember: boolean
}

/** 逗號／換行分隔的設定值轉成 slug 陣列。 */
export function parseSlugList(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 這張訂單要不要附一支勺。
 *
 * 訪客一律不送：沒有帳號就沒有「拿過沒有」這件事可以記，送了之後同一個人
 * 每次訪客結帳都會再送一支。
 */
export function scoopGiftApplies(input: ScoopGiftInput): boolean {
  if (!input.enabled) return false
  if (!input.isMember) return false
  if (input.alreadyReceived) return false
  if (input.triggerSlugs.length === 0) return false

  return input.items.some(
    (i) => i.qty > 0 && i.product_slug != null && input.triggerSlugs.includes(i.product_slug),
  )
}
