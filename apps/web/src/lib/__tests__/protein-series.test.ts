/**
 * 蛋白粉分類頁的系列分組。
 *
 * 這組測試存在的理由很具體：分組原本靠商品名稱前綴比對，而名稱是行銷文案、
 * 一直在改。四次改名就錯四次（習慣養成、多種選擇、同口味、探索誠真），每次
 * 都是商品默默跑到錯的系列，沒有任何錯誤訊息。
 */
import { describe, it, expect } from "vitest"
import { classifyProteinProduct, isMixAndMatchBundle } from "../protein-series"

const recipeVariant = {
  attributes: { recipe: { fixed: [], pool: { variant_ids: ["a", "b"], qty: 5 } } },
}
const packOfVariant = { attributes: { pack_of: { variant_id: "a", qty: 3 } } }

describe("classifyProteinProduct — 看資料而不是看名字", () => {
  it("★ 有混搭規格就是自由搭配，名字叫什麼都一樣", () => {
    for (const name of ["探索誠真 | 50克隨身包混搭10入組", "隨便取一個新名字", ""]) {
      expect(classifyProteinProduct({ name, variants: [recipeVariant] })).toBe("steady")
    }
  })

  it("★ 單一口味的多入包裝不算 —— pack_of 是尺寸選項，主角還是單袋", () => {
    const p = {
      name: "初心原味｜300克純素植物蛋白粉｜誠之初",
      variants: [{ attributes: null }, packOfVariant],
    }
    expect(classifyProteinProduct(p)).toBe("pure")
  })

  it("果實口味的多入包裝也一樣留在果實系列", () => {
    const p = {
      name: "果真草莓｜50克純素凍乾水果蛋白粉｜童心未泯",
      variants: [packOfVariant],
    }
    expect(classifyProteinProduct(p)).toBe("fruit")
  })

  it("現行四款任選組合都歸在自由搭配", () => {
    const names = [
      "習慣養成｜任選 3 袋・約 18 杯",
      "穩定補給｜任選 5 袋・約 30 杯",
      "穩定補給｜任選 10 袋・約 60 杯",
      "探索誠真 | 50克隨身包混搭10入組",
    ]
    for (const name of names) {
      expect(classifyProteinProduct({ name, variants: [recipeVariant] })).toBe("steady")
    }
  })
})

describe("classifyProteinProduct — 沒有 attributes 的舊商品走名稱退路", () => {
  it("舊的任選組合名稱仍然認得", () => {
    for (const name of [
      "穩定補給 | 300克夾鏈袋6入組",
      "任選口味 | 300克夾鏈袋5入組",
      "多種選擇 | 初心探索10天隨身組合",
      "同口味 2 入｜50克隨身包自由配",
    ]) {
      expect(classifyProteinProduct({ name })).toBe("steady")
    }
  })

  it("★ 盲盒是口味隨機，不是任選 —— 歸體驗組", () => {
    expect(classifyProteinProduct({ name: "蛋白粉盲盒｜10入口味隨機" })).toBe("trial")
  })

  it("入門推薦歸體驗組", () => {
    expect(classifyProteinProduct({ name: "入門推薦 | 6入嘗鮮組合" })).toBe("trial")
  })

  it("原味與可可歸純粹系列，其餘口味歸果實系列", () => {
    expect(classifyProteinProduct({ name: "初心原味｜50克純素植物蛋白粉｜誠之初" })).toBe("pure")
    expect(classifyProteinProduct({ name: "可可｜50克純素植物蛋白粉｜哥守護你" })).toBe("pure")
    expect(classifyProteinProduct({ name: "銀杏水蜜桃｜50克純素凍乾水果蛋白粉｜柔光歲月" })).toBe(
      "fruit",
    )
  })
})

describe("isMixAndMatchBundle", () => {
  it("沒有規格、規格沒有 attributes 都不算", () => {
    expect(isMixAndMatchBundle({ name: "x" })).toBe(false)
    expect(isMixAndMatchBundle({ name: "x", variants: [] })).toBe(false)
    expect(isMixAndMatchBundle({ name: "x", variants: [{ attributes: null }] })).toBe(false)
  })
  it("只要有一個規格是混搭就算", () => {
    expect(
      isMixAndMatchBundle({ name: "x", variants: [{ attributes: null }, recipeVariant] }),
    ).toBe(true)
  })
  it("recipe 不是物件時不算（資料壞掉不該害整頁分組跑掉）", () => {
    expect(isMixAndMatchBundle({ name: "x", variants: [{ attributes: { recipe: "yes" } }] })).toBe(
      false,
    )
  })
})
