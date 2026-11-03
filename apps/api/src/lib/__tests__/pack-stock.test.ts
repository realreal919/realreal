/**
 * 組合規格的可售數量。
 *
 * 這組測試鎖的是「前台看到的數字」與「結帳實際扣的庫存」用同一套規則。
 * 兩邊不一致的話，客人加得進購物車、結帳才被擋 —— 那比直接顯示缺貨更糟。
 */
import { describe, it, expect } from "vitest"
import { cardStockContribution, readPackOf, stockIdsToFetch, withDerivedStock } from "../pack-stock"

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

/**
 * 混搭組合的配方（2026-10-08）。
 *
 * 在這之前，「任選5袋」「原味．可可．草莓 各1袋」這類規格都掛著名目庫存 100，
 * 跟實際能出多少完全無關 —— 草莓只剩 12 袋時，「任選5袋」還顯示能賣 100 組。
 */
import { readRecipe, referencedVariantIds } from "../pack-stock"

const stock = new Map<string, number>([["or", 99], ["ca", 28], ["st", 17], ["gk", 66]])
const row = (recipe: unknown) => ({ id: "v", stock_qty: 100, attributes: { recipe } })

describe("withDerivedStock — 混搭配方", () => {
  it("★ 各1袋：由最少的那個口味決定，不是加總", () => {
    const r = withDerivedStock(
      [row({ fixed: [{ variant_id: "or", qty: 1 }, { variant_id: "ca", qty: 1 }, { variant_id: "st", qty: 1 }] })],
      stock,
    )
    expect(r[0].stock_qty).toBe(17) // 草莓最少
  })

  it("同一口味要兩袋時，用量也要算進去", () => {
    const r = withDerivedStock([row({ fixed: [{ variant_id: "st", qty: 2 }] })], stock)
    expect(r[0].stock_qty).toBe(8) // 17 ÷ 2
  })

  it("★ 任選型用池內總和估算，取代毫無根據的名目 100", () => {
    const r = withDerivedStock(
      [row({ pool: { variant_ids: ["or", "ca", "st"], qty: 5 } })],
      stock,
    )
    expect(r[0].stock_qty).toBe(28) // (99+28+17) ÷ 5 = 28.8
  })

  it("固定加任選混合時取較小的那個限制", () => {
    const r = withDerivedStock(
      [row({ fixed: [{ variant_id: "gk", qty: 1 }], pool: { variant_ids: ["st"], qty: 4 } })],
      stock,
    )
    expect(r[0].stock_qty).toBe(4) // 銀杏 66 vs 草莓 17÷4=4
  })

  it("★ 配方指向查不到的規格時跳過該項，不讓整組變 0", () => {
    const r = withDerivedStock(
      [row({ fixed: [{ variant_id: "nope", qty: 1 }, { variant_id: "st", qty: 1 }] })],
      stock,
    )
    expect(r[0].stock_qty).toBe(17)
  })

  it("整份配方都查不到時保留原值", () => {
    const r = withDerivedStock([row({ fixed: [{ variant_id: "nope", qty: 1 }] })], stock)
    expect(r[0].stock_qty).toBe(100)
  })

  it("單品賣完時組合是 0，不會變成負數", () => {
    const r = withDerivedStock([row({ fixed: [{ variant_id: "zero", qty: 1 }] })], new Map([["zero", 0]]))
    expect(r[0].stock_qty).toBe(0)
  })
})

describe("readRecipe / referencedVariantIds", () => {
  it("格式不對的配方一律忽略", () => {
    expect(readRecipe({ recipe: {} })).toBeNull()
    expect(readRecipe({ recipe: { fixed: [{ variant_id: "x", qty: 0 }] } })).toBeNull()
    expect(readRecipe(null)).toBeNull()
  })
  it("收集配方裡提到的所有規格 id", () => {
    const ids = referencedVariantIds([
      row({ fixed: [{ variant_id: "a", qty: 1 }], pool: { variant_ids: ["b", "c"], qty: 2 } }),
      { id: "p", stock_qty: 1, attributes: { pack_of: { variant_id: "d", qty: 5 } } },
    ])
    expect(ids.sort()).toEqual(["a", "b", "c", "d"])
  })
})

/**
 * 跨商品的配方：1111 限時組合是獨立商品，配方（pack_of）指向「銀杏水蜜桃 50克」
 * 那個商品的單包規格。
 *
 * 這組測試鎖的是列表頁的查詢範圍。withDerivedStock 是逐個商品呼叫的，所以
 * 「要查哪些庫存」不能因為同一頁有別的商品持有那個 id 就跳過 —— 跳過的話組合
 * 規格退回存在資料庫裡的 stock_qty（pack_of 的規格存 0），商品頁顯示 23 組、
 * 列表卡片卻顯示已售完。
 */
describe("跨商品配方的庫存查詢範圍", () => {
  const ginkgoUnit = { id: "gp-unit", stock_qty: 1401, attributes: null }
  const pack60 = {
    id: "gp-60",
    stock_qty: 0,
    attributes: { pack_of: { variant_id: "gp-unit", qty: 60 } },
  }

  it("★ 配方指向的 id 要查，就算同一頁的其他商品持有它", () => {
    // 第一個商品是銀杏水蜜桃（持有單包），第二個是限時組合（配方指向它）。
    expect(stockIdsToFetch([[ginkgoUnit], [pack60]])).toEqual(["gp-unit"])
  })

  it("★ 查回來之後，逐個商品換算也要算得出 23 組", () => {
    const external = new Map([["gp-unit", 1401]])
    const [p] = withDerivedStock([pack60], external)
    expect(p.stock_qty).toBe(23) // 1401 ÷ 60
  })

  it("沒把外部庫存傳進去就會退回 0 —— 這就是卡片顯示售完的成因", () => {
    const [p] = withDerivedStock([pack60])
    expect(p.stock_qty).toBe(0)
  })

  it("同商品自己的規格優先，不會被外部查到的舊值蓋掉", () => {
    const external = new Map([["u1", 999]])
    const [, p] = withDerivedStock([unit, pack5], external)
    expect(p.stock_qty).toBe(4) // 用同商品的 20，不是外部的 999
  })
})

/**
 * 商品卡的「總庫存」—— 為 0 就蓋上「已售完」。
 *
 * 組合規格算 0 的規則是為了避免同一批貨被重複計（「草莓 300克」的單袋 20 +
 * 3入組 100 + 5入組 100 = 220，實際只有 20 袋）。但它預設組合規格一定跟單品
 * 在同一個商品底下 —— 1111 限時組合是獨立商品，配方指向銀杏水蜜桃單包，整個
 * 商品只有那一個規格，全部算 0 就變成已售完（商品頁卻顯示 23 組）。
 */
describe("cardStockContribution", () => {
  const ginkgoUnitId = "gp-unit"
  const pack60 = {
    id: "gp-60",
    stock_qty: 0,
    attributes: { pack_of: { variant_id: ginkgoUnitId, qty: 60 } },
  }
  const external = new Map([[ginkgoUnitId, 1401]])

  it("★ 配方指向別的商品 → 算換算後的可售組數，不是 0", () => {
    expect(cardStockContribution(pack60, new Set(["gp-60"]), external)).toBe(23)
  })

  it("★ 配方指向同商品的單品 → 算 0，同一批貨不重複計", () => {
    const siblings = new Set(["u1", "p5"])
    expect(cardStockContribution(pack5, siblings, new Map())).toBe(0)
  })

  it("沒有配方的規格照自己的庫存算", () => {
    expect(cardStockContribution(unit, new Set(["u1"]), new Map())).toBe(20)
  })

  it("跨商品但來源查不到 → 保留自己存的值，填錯不該讓商品變缺貨", () => {
    const orphan = { id: "x", stock_qty: 42, attributes: { pack_of: { variant_id: "nope", qty: 5 } } }
    expect(cardStockContribution(orphan, new Set(["x"]), new Map())).toBe(42)
  })

  it("來源賣完時跨商品的組合也是 0", () => {
    expect(cardStockContribution(pack60, new Set(["gp-60"]), new Map([[ginkgoUnitId, 59]]))).toBe(0)
  })
})
