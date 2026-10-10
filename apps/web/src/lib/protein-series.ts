/**
 * 蛋白粉分類頁的四個系列分組。
 *
 * 2026-10-10 改成**讀商品規格的 attributes**，不再只靠商品名稱前綴。
 *
 * 為什麼改：名稱是行銷文案，本來就會一直改，而分組靠前綴比對 —— 改名當天那個
 * 商品就默默掉到 fallback、被歸到錯的系列，而且沒有任何錯誤訊息。這個專案已經
 * 因為同一件事出過四次（習慣養成、多種選擇、同口味、探索誠真），出貨單的組合包
 * 對照表也是同樣的毛病。
 *
 * 判準用 `recipe` 而不是 `pack_of`：
 *   - `recipe` = 這個規格是「從多種口味裡選 N 件」的混搭組合 → 就是任選組合
 *   - `pack_of` = 單一口味的多入包裝（原味 300 克的 3 入組、5 入組）
 *
 * 拿 pack_of 當判準的話，每個單一口味商品都會因為有 3 入／5 入規格而被歸進
 * 「自由搭配」，而那些商品的主角是單袋。
 *
 * 名稱規則保留當退路：舊商品（入門推薦、盲盒、同口味…）沒有 attributes，
 * 少了這些規則它們會全部掉到「果實系列」。
 */

export type ProteinSeries = "pure" | "fruit" | "steady" | "trial"

export const PROTEIN_SERIES_META: Record<ProteinSeries, { title: string; subtitle: string }> = {
  pure: { title: "純粹系列", subtitle: "原味、可可——簡單純粹的日常之選" },
  fruit: { title: "果實系列", subtitle: "草莓、杏仁火龍果、芝麻藍莓——真實水果的自然風味" },
  steady: { title: "自由搭配", subtitle: "依喜好選口味、配份量的組合" },
  trial: { title: "多日體驗", subtitle: "初次嘗試的天數體驗組合" },
}

export const PROTEIN_SERIES_ORDER: ProteinSeries[] = ["pure", "fruit", "steady", "trial"]

type VariantLike = { attributes?: Record<string, unknown> | null }
export type ProductForSeries = { name: string; variants?: VariantLike[] | null }

/** 這個商品有沒有「從多種口味裡任選」的規格。 */
export function isMixAndMatchBundle(product: ProductForSeries): boolean {
  return (product.variants ?? []).some((v) => {
    const recipe = v?.attributes?.recipe
    return recipe != null && typeof recipe === "object"
  })
}

export function classifyProteinProduct(product: ProductForSeries): ProteinSeries {
  // 先看資料：有混搭規格就是任選組合，不管它叫什麼名字
  if (isMixAndMatchBundle(product)) return "steady"

  // 以下是沒有 attributes 的舊商品才會走到的退路
  const name = product.name
  if (name.startsWith("穩定補給") || name.startsWith("任選口味")) return "steady"
  if (name.startsWith("習慣養成")) return "steady"
  if (name.startsWith("多種選擇") || name.startsWith("多種搭配") || name.startsWith("任選組合"))
    return "steady"
  if (name.startsWith("探索誠真")) return "steady"
  // 同口味 2 入組沒有名稱前綴，而且「同口味」不含「原味」
  if (name.startsWith("同口味")) return "steady"
  if (name.startsWith("入門推薦")) return "trial"
  // 盲盒是「口味隨機」，不是任選 —— 即使它也是多入組合，歸在體驗組才對
  if (name.startsWith("蛋白粉盲盒")) return "trial"
  if (name.includes("原味") || name.includes("可可")) return "pure"
  return "fruit"
}
