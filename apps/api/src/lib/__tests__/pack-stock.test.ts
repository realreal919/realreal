/**
 * 組合規格的可售數量。
 *
 * 這組測試鎖的是「前台看到的數字」與「結帳實際扣的庫存」用同一套規則。
 * 兩邊不一致的話，客人加得進購物車、結帳才被擋 —— 那比直接顯示缺貨更糟。
 */
import { describe, it, expect } from "vitest"
import { readPackOf, withDerivedStock } from "../pack-stock"

const unit = { id: "u1", stock_qty: 20, attributes: null }
const pack5 = { id: "p5", stock_qty: 100, attributes: { pack_of: { variant_id: "u1", qty: 5 } } }

describe("withDerivedStock", () => {
  it("★ 組合規格改成由單品換算，不再用自己那個對不上的數字", () => {
    const [, p] = withDerivedStock([unit, pack5])
    expect(p.stock_qty).toBe(4) // 20 袋 ÷ 每組 5 袋
  })

  it("單品規格維持原值", () => {
    const [u] = withDerivedStock([unit, pack5])
    expect(u.stock_qty).toBe(20)
  })

  it("不滿一組時無條件捨去", () => {
    const [, p] = withDerivedStock([{ ...unit, stock_qty: 14 }, pack5])
    expect(p.stock_qty).toBe(2) // 14 ÷ 5 = 2.8
  })

  it("單品賣完時組合也是 0", () => {
    const [, p] = withDerivedStock([{ ...unit, stock_qty: 0 }, pack5])
    expect(p.stock_qty).toBe(0)
  })

  it("★ 配方指向不存在的單品時保留原值 —— 填錯不該讓商品整個變缺貨", () => {
    const orphan = { id: "p9", stock_qty: 42, attributes: { pack_of: { variant_id: "nope", qty: 5 } } }
    const [, p] = withDerivedStock([unit, orphan])
    expect(p.stock_qty).toBe(42)
  })

  it("沒有配方的規格完全不受影響", () => {
    const plain = { id: "x", stock_qty: 7, attributes: { 置底: "是" } }
    expect(withDerivedStock([plain])[0].stock_qty).toBe(7)
  })
})

describe("readPackOf", () => {
  it("認得正常的配方", () => {
    expect(readPackOf({ pack_of: { variant_id: "u1", qty: 3 } })).toEqual({ variant_id: "u1", qty: 3 })
  })
  it("★ 數量為 0 或負數視為沒有配方，避免除以零", () => {
    expect(readPackOf({ pack_of: { variant_id: "u1", qty: 0 } })).toBeNull()
    expect(readPackOf({ pack_of: { variant_id: "u1", qty: -2 } })).toBeNull()
  })
  it("缺欄位或型別不對一律當作沒有配方", () => {
    expect(readPackOf(null)).toBeNull()
    expect(readPackOf({})).toBeNull()
    expect(readPackOf({ pack_of: { qty: 3 } })).toBeNull()
    expect(readPackOf({ pack_of: "5" })).toBeNull()
  })
})
