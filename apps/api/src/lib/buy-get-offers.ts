/**
 * 把 campaigns 表裡的「買 X 送 Y」活動整成前台文案要用的形狀。
 *
 * 抽成純函式是因為這裡每一條規則都是踩過的坑，而 config.ts 裡那段是接 Supabase
 * 的查詢，測不到：
 *   - 收兩種 type。buy_x_get_y 可重複、bundle 一次性，但「買 X 送 Y」這句話兩邊
 *     都成立（evaluator 都是 buyQty + getQty 件算一組）。2026-10-11 之前只收
 *     buy_x_get_y，店主開的 bundle 活動結帳會算，但跑馬燈與商品頁完全不提。
 *   - scope 是 all 時不能把活動名稱當 label。名稱是「全部品項任選買10送1」，
 *     文案是 `${label}買${buyQty}送${getQty}`，接起來會變成「…買10送1買10送1」。
 *   - 免費件數：舊種子資料叫 free_quantity、後台表單存 get_quantity。只讀一個的
 *     話，另一種來源的活動會因為件數讀成 0 而整條被濾掉（evalBundle 兩個都接）。
 */

export type BuyGetCampaignRow = {
  name?: string | null
  type?: string | null
  config?: unknown
  ends_at?: string | null
}

export type BuyGetOffer = {
  label: string
  buyQty: number
  getQty: number
  /** true = 湊兩組免兩件（buy_x_get_y）；false = 整筆訂單只免一次（bundle） */
  repeats: boolean
  freeRule: "lowest_price" | "highest_price"
}

/** scope 是 all 的活動，自己生一個短名，不要拿活動名稱來疊。 */
const ALL_SCOPE_LABEL = "全館任選"

export function mapBuyGetOffers(
  rows: BuyGetCampaignRow[],
  nowIso: string,
): BuyGetOffer[] {
  return rows
    .filter((c) => !c.ends_at || c.ends_at > nowIso)
    .map((c) => {
      const cfg = (c.config ?? {}) as Record<string, unknown>
      const scope = String(cfg.scope ?? "").trim()
      const fallbackLabel = scope === "all" ? ALL_SCOPE_LABEL : String(c.name ?? "")
      return {
        // copy_label 是給客人看的短名（「300克夾鏈袋」）。
        label: String(cfg.copy_label ?? fallbackLabel).trim(),
        buyQty: Number(cfg.buy_quantity ?? 0),
        getQty: Number(cfg.get_quantity ?? cfg.free_quantity ?? 0),
        repeats: c.type === "buy_x_get_y",
        freeRule:
          cfg.free_item_rule === "highest_price"
            ? ("highest_price" as const)
            : ("lowest_price" as const),
      }
    })
    .filter(
      (o) =>
        o.label !== "" &&
        Number.isFinite(o.buyQty) &&
        o.buyQty > 0 &&
        Number.isFinite(o.getQty) &&
        o.getQty > 0,
    )
}
