/**
 * 第三方實驗室檢驗報告圖：依商品口味挑一張，排在商品頁「真實回饋」那張的下方。
 *
 * 口味從**商品名稱**判讀，不是從 slug —— slug 的命名沒有規律（草莓 50 克叫
 * vegan-protein-powder-strawberry、300 克卻叫 vegan-protein-st300），而名稱
 * 一定帶著口味。
 *
 * 混合口味的組合商品（任選 3／5／10 袋、30 天組、試飲組…）名稱裡沒有口味，
 * 一律用草莓那張（2026-11-08 店主指定）。
 */
export const LAB_REPORT_DIR = "/product-info/protein/lab"

/** 混合口味組合商品用的那張。 */
export const LAB_REPORT_FALLBACK = "strawberry"

/**
 * 比對順序就是陣列順序。長的關鍵字要排在短的前面：「芝麻藍莓」含「藍莓」、
 * 「杏仁火龍果」含「杏仁」，先吃掉完整口味名才不會對到別張報告。
 */
const BY_FLAVOUR: ReadonlyArray<readonly [string, string]> = [
  ["銀杏水蜜桃", "ginkgo-peach"],
  ["杏仁火龍果", "almond-dragonfruit"],
  ["芝麻藍莓", "black-sesame"],
  ["果真草莓", "strawberry"],
  ["初心原味", "original"],
  ["可可", "cocoa"],
]

/** 商品名稱 → 檢驗報告圖的檔名（不含路徑與副檔名）。 */
export function labReportName(productName: string | null | undefined): string {
  const name = productName ?? ""
  for (const [keyword, file] of BY_FLAVOUR) {
    if (name.includes(keyword)) return file
  }
  return LAB_REPORT_FALLBACK
}

/** 商品名稱 → 檢驗報告圖的完整路徑。 */
export function labReportSrc(productName: string | null | undefined): string {
  return `${LAB_REPORT_DIR}/${labReportName(productName)}.webp`
}
