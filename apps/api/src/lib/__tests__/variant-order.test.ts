/**
 * 口味選項的排序與停售規則。
 *
 * 真正要守住的是 60 天組實際的選項名稱 —— 單一口味放一起、30+30 放一起、
 * 客人自選的放最後。另外兩個容易出錯的地方：「杏仁火龍果」不能被算成
 * 杏仁、火龍果兩種口味；括號裡的「銀杏水蜜桃口味限5入」只是說明，不算口味。
 */
import { describe, it, expect } from "vitest"
import { sortVariants, variantSortKey, isHiddenVariant, visibleSortedVariants } from "../variant-order"

const names = (vs: Array<{ name: string }>) => vs.map((v) => v.name)
const v = (name: string, attributes: Record<string, string> | null = null) => ({ name, attributes })

describe("60 天組的實際選項", () => {
  const current = [
    "選擇風味: 芝麻藍莓 60入",
    "選擇風味: 可可．芝麻藍莓 各30入",
    "選擇風味: 草莓．杏仁火龍果 各30入",
    "選擇風味: 銀杏水蜜桃．其他口味 各30入（其他口味請於結帳頁備註）",
    "選擇風味: 原味 60入",
    "選擇風味: 銀杏水蜜桃 60入",
    "選擇風味: 原味．草莓．芝麻藍莓．杏仁火龍果．可可 各12入",
    "選擇風味: 原味．可可 各30入",
    "選擇風味: 草莓．芝麻藍莓．杏仁火龍果 各 20入",
    "選擇風味: 草莓 60入",
  ].map((n) => v(n))

  it("★ 單一口味 60入全部排在最前面，依固定口味順序", () => {
    expect(names(sortVariants(current)).slice(0, 4)).toEqual([
      "選擇風味: 原味 60入",
      "選擇風味: 草莓 60入",
      "選擇風味: 芝麻藍莓 60入",
      "選擇風味: 銀杏水蜜桃 60入",
    ])
  })

  it("★ 30+30 排在一起，含「其他口味」的放在這一組最後", () => {
    expect(names(sortVariants(current)).slice(4, 8)).toEqual([
      "選擇風味: 原味．可可 各30入",
      "選擇風味: 可可．芝麻藍莓 各30入",
      "選擇風味: 草莓．杏仁火龍果 各30入",
      "選擇風味: 銀杏水蜜桃．其他口味 各30入（其他口味請於結帳頁備註）",
    ])
  })

  it("三種、五種口味的組合依序排在後面", () => {
    expect(names(sortVariants(current)).slice(8)).toEqual([
      "選擇風味: 草莓．芝麻藍莓．杏仁火龍果 各 20入",
      "選擇風味: 原味．草莓．芝麻藍莓．杏仁火龍果．可可 各12入",
    ])
  })
})

describe("名稱解析", () => {
  it("★「杏仁火龍果」是一種口味，不是兩種", () => {
    expect(variantSortKey("選擇風味: 杏仁火龍果 60入")).toEqual([1, 0, [3]])
  })

  it("★ 括號內的說明不算口味", () => {
    // 若把「銀杏水蜜桃口味限5入」算進去，會被當成「銀杏＋其他」排進 30+30
    expect(variantSortKey("選擇風味: 其他口味(銀杏水蜜桃口味限5入)")).toEqual([999, 1, []])
  })

  it("★ 完全由客人自選的選項排在整份清單最後", () => {
    const sorted = sortVariants([
      v("選擇風味: 其他口味(於結帳頁備註自己喜歡的組合)"),
      v("選擇風味: 原味．草莓．芝麻藍莓．杏仁火龍果．可可 各12入"),
      v("選擇風味: 果真草莓 3入"),
    ])
    expect(names(sorted).at(-1)).toBe("選擇風味: 其他口味(於結帳頁備註自己喜歡的組合)")
  })

  it("認不出口味的名稱維持原本順序，放在最後", () => {
    const sorted = sortVariants([v("預設"), v("選擇風味: 可可 3入"), v("隨身包 × 10入")])
    expect(names(sorted)).toEqual(["選擇風味: 可可 3入", "預設", "隨身包 × 10入"])
  })

  it("不修改傳入的陣列", () => {
    const input = [v("選擇風味: 草莓 60入"), v("選擇風味: 原味 60入")]
    sortVariants(input)
    expect(names(input)).toEqual(["選擇風味: 草莓 60入", "選擇風味: 原味 60入"])
  })
})

describe("停售", () => {
  it("★ attributes 標了「停售：是」的選項不顯示", () => {
    const out = visibleSortedVariants([
      v("選擇風味: 其他口味(銀杏水蜜桃口味限5入)", { 停售: "是" }),
      v("選擇風味: 原味 60入"),
    ])
    expect(names(out)).toEqual(["選擇風味: 原味 60入"])
  })

  it("其他 attributes 不影響顯示", () => {
    expect(isHiddenVariant(v("x", { 包數: "30" }))).toBe(false)
    expect(isHiddenVariant(v("x", null))).toBe(false)
    expect(isHiddenVariant({ attributes: { 停售: "否" } })).toBe(false)
  })

  it("沒有規格時回傳空陣列", () => {
    expect(visibleSortedVariants(null)).toEqual([])
  })
})
