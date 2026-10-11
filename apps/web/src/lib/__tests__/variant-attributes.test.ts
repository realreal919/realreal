import { describe, expect, it } from "vitest"
import { describeAttribute, mergeAttributes, splitAttributes } from "../variant-attributes"

const RECIPE = { pool: { qty: 10, variant_ids: ["a", "b"] } }

describe("splitAttributes", () => {
  it("字串屬性可編輯，巢狀物件留在 preserved", () => {
    const { editable, preserved } = splitAttributes({ recipe: RECIPE, 置頂: "是" })
    expect(editable).toEqual([{ key: "置頂", value: "是" }])
    expect(preserved).toEqual({ recipe: RECIPE })
  })

  it("null / undefined 當成空的", () => {
    expect(splitAttributes(null)).toEqual({ editable: [], preserved: {} })
    expect(splitAttributes(undefined)).toEqual({ editable: [], preserved: {} })
  })

  it("陣列、數字、布林都不給表格編輯", () => {
    const { editable, preserved } = splitAttributes({ list: [1], n: 3, b: true, s: "x" })
    expect(editable).toEqual([{ key: "s", value: "x" }])
    expect(preserved).toEqual({ list: [1], n: 3, b: true })
  })
})

describe("mergeAttributes", () => {
  it("★ 存檔後 recipe 原封不動（這是整個檔案存在的理由）", () => {
    const { editable, preserved } = splitAttributes({ recipe: RECIPE, 置頂: "是" })
    const out = mergeAttributes(editable, preserved)
    expect(out.recipe).toEqual(RECIPE)
    expect(out.recipe).not.toBe("[object Object]")
  })

  it("★ 改了別的屬性也不會動到 recipe", () => {
    const { preserved } = splitAttributes({ recipe: RECIPE, 置頂: "是" })
    const out = mergeAttributes([{ key: "置頂", value: "否" }, { key: "停售", value: "是" }], preserved)
    expect(out).toEqual({ 置頂: "否", 停售: "是", recipe: RECIPE })
  })

  it("★ 表格上同名的鍵蓋不掉結構化的值", () => {
    const out = mergeAttributes([{ key: "recipe", value: "[object Object]" }], { recipe: RECIPE })
    expect(out.recipe).toEqual(RECIPE)
  })

  it("空白鍵略過（使用者正在打字的那一列）", () => {
    expect(mergeAttributes([{ key: "", value: "x" }, { key: "  ", value: "y" }], {})).toEqual({})
  })

  it("鍵前後空白會去掉", () => {
    expect(mergeAttributes([{ key: " 置頂 ", value: "是" }], {})).toEqual({ 置頂: "是" })
  })

  it("刪掉表格上的列就真的刪掉", () => {
    const { preserved } = splitAttributes({ recipe: RECIPE, 置頂: "是" })
    expect(mergeAttributes([], preserved)).toEqual({ recipe: RECIPE })
  })

  it("整個來回一趟不變形", () => {
    const original = { recipe: RECIPE, 置頂: "是", 停售: "否" }
    const { editable, preserved } = splitAttributes(original)
    expect(mergeAttributes(editable, preserved)).toEqual(original)
  })
})

describe("describeAttribute", () => {
  it("物件列出鍵名、陣列列出長度", () => {
    expect(describeAttribute(RECIPE)).toBe("結構化設定（pool）")
    expect(describeAttribute([1, 2, 3])).toBe("陣列（3 項）")
  })
})
