/**
 * 後台規格屬性編輯器的資料進出。
 *
 * 2026-10-11 修的問題：屬性編輯器是一個「文字鍵 / 文字值」的表格，但 attributes
 * 裡並不是每個值都是文字 —— 混搭組合的 recipe 是巢狀物件：
 *
 *   { "recipe": { "pool": { "qty": 10, "variant_ids": [...] } }, "置頂": "是" }
 *
 * 把它塞進 <Input value={...}> 會被 React 轉成字串 "[object Object]"，使用者只要
 * 動到同一個規格的任何一個屬性，存檔就會把整份配方覆寫成那串字 —— 商品頁的口味
 * 組合、結帳的庫存扣抵、出貨單的展開全部跟著壞掉，而且原始資料救不回來。
 *
 * 所以把屬性分成兩類：
 *   editable  —— 值是字串的，照舊用表格編輯（置頂、停售都是這類）
 *   preserved —— 值不是字串的（物件、陣列、數字、布林），編輯器唯讀顯示，
 *                存檔時原封不動帶回去
 *
 * 這一層只負責「不要弄壞」。真的要編配方，是另外一件事（目前只能改資料庫）。
 */

export type AttributeRow = { key: string; value: string }

export type SplitAttributes = {
  /** 可以用文字表格編輯的屬性 */
  editable: AttributeRow[]
  /** 不是字串、編輯器不能碰的屬性，存檔時原樣帶回 */
  preserved: Record<string, unknown>
}

export function splitAttributes(
  value: Record<string, unknown> | null | undefined,
): SplitAttributes {
  const editable: AttributeRow[] = []
  const preserved: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value ?? {})) {
    if (typeof v === "string") editable.push({ key, value: v })
    else preserved[key] = v
  }
  return { editable, preserved }
}

/**
 * 表格內容 + 保留的屬性 → 要送出去的 attributes。
 *
 * 空白的鍵略過（使用者正在打字的那一列）。同名時後面的覆蓋前面，跟原本的行為一致。
 * preserved 最後才併入，所以表格上就算出現同名的鍵也蓋不掉結構化的值。
 */
export function mergeAttributes(
  rows: AttributeRow[],
  preserved: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    const k = r.key.trim()
    if (!k) continue
    out[k] = r.value
  }
  return { ...out, ...preserved }
}

/** 唯讀顯示用的摘要，不求好看，只求看得出來那裡有東西、不是空的。 */
export function describeAttribute(v: unknown): string {
  if (Array.isArray(v)) return `陣列（${v.length} 項）`
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>)
    return `結構化設定（${keys.join("、") || "空"}）`
  }
  return String(v)
}
