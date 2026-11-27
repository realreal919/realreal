import { describe, it, expect } from "vitest"
import { packSizeFromVariantName } from "../enrich-products"

/**
 * 商品卡的「每袋價」是從規格名稱裡的袋數算出來的（NT$335 而不是 NT$3,350）。
 *
 * 2026-11-27 原味夾鏈袋的規格改名成「3入18份」這種寫法（份數＝袋數 × 6 份），
 * 舊的 /^(\d+)入組$/ 對不上，整個商品卡會從「每袋價」掉回「總價區間」——
 * 變成 NT$400 – NT$3,140，看起來像一袋要三千多。
 */
describe("packSizeFromVariantName", () => {
  it("★ 新寫法「N入M份」取的是袋數 N，不是份數 M", () => {
    expect(packSizeFromVariantName("3入18份")).toBe(3)
    expect(packSizeFromVariantName("5入30份")).toBe(5)
    expect(packSizeFromVariantName("10入60份")).toBe(10)
  })

  it("舊寫法「N入組」照舊", () => {
    expect(packSizeFromVariantName("3入組")).toBe(3)
    expect(packSizeFromVariantName("5入組")).toBe(5)
    expect(packSizeFromVariantName("15入組")).toBe(15)
  })

  it("單包、單袋沒有袋數 —— 它們本來就是每袋價", () => {
    expect(packSizeFromVariantName("單包")).toBeNull()
    expect(packSizeFromVariantName("單袋")).toBeNull()
  })

  it("★ 不能誤認盲盒的「10入（口味隨機）」—— 那是一個商品，不是 10 袋", () => {
    expect(packSizeFromVariantName("10入（口味隨機）")).toBeNull()
  })

  it("組合商品的風味選項不算 —— 它們顯示總價區間", () => {
    expect(packSizeFromVariantName("選擇風味: 原味×15．銀杏水蜜桃×15")).toBeNull()
    expect(packSizeFromVariantName("選擇風味: 初心原味 5袋")).toBeNull()
  })

  it("1 入不算 —— 除以 1 等於沒換算，照舊顯示總價", () => {
    expect(packSizeFromVariantName("1入組")).toBeNull()
    expect(packSizeFromVariantName("1入6份")).toBeNull()
  })

  it("空值不會炸", () => {
    expect(packSizeFromVariantName("")).toBeNull()
    expect(packSizeFromVariantName(null)).toBeNull()
    expect(packSizeFromVariantName(undefined)).toBeNull()
  })
})
