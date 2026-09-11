/**
 * 商品規格（口味選項）的顯示規則：哪些要藏起來、剩下的怎麼排。
 *
 * 排序以前沒有任何規則 —— 選項照資料庫回傳的順序出現，等於隨機。60 天組
 * 第一個是「芝麻藍莓 60入」、最後一個是「草莓 60入」，單一口味和 30+30 的
 * 組合穿插在一起，客人得整排看完才找得到要的。
 *
 * 規則（由選項名稱推出來，所以新增選項不必另外設定位置）：
 *   1. 依「幾種口味」分組：單一口味 → 兩種 → 三種 → …
 *   2. 同一組內依固定口味順序：原味、可可、草莓、杏仁火龍果、芝麻藍莓、銀杏水蜜桃
 *   3. 含「其他口味」的組合排在該組最後（例：銀杏水蜜桃．其他口味 各30入）
 *   4. 完全由客人自選的「其他口味」選項排在整份清單最後
 *   5. 認不出口味的名稱（例：「預設」）維持原本順序，放最後
 * 括號裡的字是說明（例：「銀杏水蜜桃口味限5入」），不算口味。
 *
 * 隱藏：規格表沒有「上架／下架」欄位，而已經被訂單用過的規格刪不掉
 * （order_items.variant_id 有外鍵，沒有 cascade）。所以停售的規格在
 * attributes 裡標 { "停售": "是" } —— 後台規格編輯器本來就把 attributes
 * 顯示成「欄位：值」，店主看得到、也能自己刪掉這一欄恢復販售。
 */

export const FLAVOUR_ORDER = ["原味", "可可", "草莓", "杏仁火龍果", "芝麻藍莓", "銀杏水蜜桃"] as const

// 長的別名必須先比對：「杏仁火龍果」同時包含「杏仁」與「火龍果」，
// 先吃掉整個名稱才不會被算成兩種口味。
const ALIASES: Array<[string, number]> = [
  ["杏仁火龍果", 3], ["芝麻藍莓", 4], ["銀杏水蜜桃", 5], ["果真草莓", 2], ["初心原味", 0],
  ["原味", 0], ["可可", 1], ["草莓", 2], ["杏仁", 3], ["火龍果", 3],
  ["芝麻", 4], ["藍莓", 4], ["銀杏", 5], ["水蜜桃", 5],
]

export const HIDDEN_ATTR_KEY = "停售"
export const HIDDEN_ATTR_VALUE = "是"

type WithAttributes = { attributes?: Record<string, unknown> | null }
type WithName = { name?: string | null }

export function isHiddenVariant(v: WithAttributes): boolean {
  return v.attributes?.[HIDDEN_ATTR_KEY] === HIDDEN_ATTR_VALUE
}

/** [組別, 是否含其他口味, 口味順序] —— 比較時逐項比。 */
export function variantSortKey(name: string | null | undefined): [number, number, number[]] {
  const body = (name ?? "")
    .replace(/^選擇風味[:：]\s*/, "")
    .replace(/（[^）]*）|\([^)]*\)/g, "")

  let rest = body
  const found = new Set<number>()
  for (const [alias, idx] of ALIASES) {
    if (rest.includes(alias)) {
      found.add(idx)
      rest = rest.split(alias).join("")
    }
  }
  const hasOther = body.includes("其他")
  const flavours = [...found].sort((a, b) => a - b)

  if (flavours.length === 0 && !hasOther) return [1000, 0, []] // 認不出口味
  if (flavours.length === 0) return [999, 1, []]                // 完全自選
  return [flavours.length + (hasOther ? 1 : 0), hasOther ? 1 : 0, flavours]
}

function compareKeys(a: [number, number, number[]], b: [number, number, number[]]): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  const n = Math.max(a[2].length, b[2].length)
  for (let i = 0; i < n; i++) {
    const x = a[2][i] ?? -1
    const y = b[2][i] ?? -1
    if (x !== y) return x - y
  }
  return 0
}

/** 穩定排序：規則比不出先後的，維持原本順序。不修改傳入的陣列。 */
export function sortVariants<T extends WithName>(variants: T[]): T[] {
  return variants
    .map((v, i) => ({ v, i, k: variantSortKey(v.name) }))
    .sort((a, b) => compareKeys(a.k, b.k) || a.i - b.i)
    .map(({ v }) => v)
}

/** 前台要顯示的規格：去掉停售的，再依規則排序。 */
export function visibleSortedVariants<T extends WithName & WithAttributes>(variants: T[] | null | undefined): T[] {
  return sortVariants((variants ?? []).filter((v) => !isHiddenVariant(v)))
}
