/**
 * 檢驗報告圖掛錯口味，等於在商品頁上拿別的樣品的報告當佐證 —— 這組測試把
 * 每一個蛋白粉商品的名稱都釘住，包含容易互相吃掉的那幾組關鍵字。
 */
import { describe, it, expect } from "vitest"
import { labReportName, labReportSrc, LAB_REPORT_FALLBACK } from "../lab-report"

describe("依口味挑檢驗報告", () => {
  it("★ 單一口味的 50 克與 300 克都對到同一張", () => {
    expect(labReportName("初心原味｜50克純素植物蛋白粉｜誠之初")).toBe("original")
    expect(labReportName("初心原味｜300克純素植物蛋白粉｜誠之初")).toBe("original")
    expect(labReportName("可可｜50克純素植物蛋白粉｜哥守護你")).toBe("cocoa")
    expect(labReportName("可可｜300克純素植物蛋白粉｜哥守護你")).toBe("cocoa")
    expect(labReportName("果真草莓 | 300克純素凍乾水果蛋白粉 | 童心未泯")).toBe("strawberry")
    expect(labReportName("銀杏水蜜桃｜50克純素凍乾水果蛋白粉｜柔光歲月")).toBe("ginkgo-peach")
  })

  it("★ 杏仁火龍果不會被「可可」以外的關鍵字吃掉", () => {
    expect(labReportName("杏仁火龍果｜300克純素凍乾水果蛋白粉｜自由之心")).toBe("almond-dragonfruit")
    expect(labReportName("杏仁火龍果｜50克純素凍乾水果蛋白粉｜自由之心")).toBe("almond-dragonfruit")
  })

  it("★ 芝麻藍莓對到黑芝麻那張，不是草莓", () => {
    expect(labReportName("芝麻藍莓｜300克純素凍乾水果蛋白粉｜深邃之美")).toBe("black-sesame")
    expect(labReportName("芝麻藍莓｜50克純素凍乾水果蛋白粉｜深邃之美")).toBe("black-sesame")
  })

  it("★ 1111 限時組合是單一口味，對到水蜜桃", () => {
    expect(labReportName("1111限時組合｜銀杏水蜜桃 50克隨身包 60入")).toBe("ginkgo-peach")
  })

  it("★ 混合口味的組合商品一律用草莓那張", () => {
    for (const name of [
      "習慣養成｜任選 3 袋・共 900 克",
      "穩定補給｜任選 5 袋・共 1,500 克",
      "穩定補給｜任選 10 袋・共 3,000 克",
      "穩定補給 | 30天植物蛋白自選組合",
      "穩定補給 | 300克夾鏈袋6入組",
      "探索誠真 | 50克隨身包混搭10入組",
      "探索誠真 | 全口味試飲11入組",
      "入門推薦 | 6入嘗鮮組合",
      "入門推薦 | 一週營養任務包",
      "蛋白粉盲盒｜10入口味隨機",
      "會員限定 | 60 天植物蛋白支持計畫",
    ]) {
      expect(labReportName(name)).toBe(LAB_REPORT_FALLBACK)
    }
  })

  it("名稱空的或沒給也要有圖，不能回傳壞路徑", () => {
    expect(labReportName("")).toBe(LAB_REPORT_FALLBACK)
    expect(labReportName(null)).toBe(LAB_REPORT_FALLBACK)
    expect(labReportName(undefined)).toBe(LAB_REPORT_FALLBACK)
  })

  it("路徑組出來是 public 底下真的有的檔名", () => {
    expect(labReportSrc("可可｜50克純素植物蛋白粉｜哥守護你"))
      .toBe("/product-info/protein/lab/cocoa.webp")
  })
})
