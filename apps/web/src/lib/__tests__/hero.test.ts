import { describe, expect, it } from "vitest"
import { heroRatioProblem, heroSlides, HERO_RATIO_H, HERO_RATIO_W } from "../hero"

// 主視覺的張數與順序是後台資料（site_contents.homepage_hero），不是程式常數。
// 這裡鎖的是「資料長歪了也不會把首頁弄成空白」。
describe("heroSlides", () => {
  it("沒有 images 時用舊的單張 image", () => {
    expect(heroSlides({ image: "/x.webp" })).toEqual([{ src: "/x.webp", alt: "" }])
  })

  it("什麼都沒有時用內建的退路圖，不會回空陣列", () => {
    expect(heroSlides(null)).toEqual([{ src: "/home/banner.jpg", alt: "" }])
    expect(heroSlides({})).toEqual([{ src: "/home/banner.jpg", alt: "" }])
  })

  it("images 收字串也收物件", () => {
    expect(heroSlides({ images: ["/a.webp", { src: "/b.webp", alt: "檢驗結果" }] })).toEqual([
      { src: "/a.webp", alt: "" },
      { src: "/b.webp", alt: "檢驗結果" },
    ])
  })

  it("images 比 image 優先", () => {
    expect(heroSlides({ image: "/old.webp", images: ["/new.webp"] })).toEqual([
      { src: "/new.webp", alt: "" },
    ])
  })

  it("空字串與沒有 src 的那幾筆丟掉；全丟光就退回單張", () => {
    expect(heroSlides({ images: ["/a.webp", "", { alt: "沒有圖" }, { src: "  " }] })).toEqual([
      { src: "/a.webp", alt: "" },
    ])
    expect(heroSlides({ image: "/old.webp", images: [] })).toEqual([{ src: "/old.webp", alt: "" }])
    expect(heroSlides({ image: "/old.webp", images: [""] })).toEqual([{ src: "/old.webp", alt: "" }])
  })
})

// 後台靠這個擋掉比例不符的圖。擋錯了的代價是：前台把客人設計好的 banner 裁掉一塊。
describe("heroRatioProblem", () => {
  it("剛好是主視覺尺寸就放行", () => {
    expect(heroRatioProblem(HERO_RATIO_W, HERO_RATIO_H)).toBeNull()
  })

  it("同比例但不同尺寸也放行（1920×1080、3344×1882）", () => {
    expect(heroRatioProblem(1920, 1080)).toBeNull()
    expect(heroRatioProblem(HERO_RATIO_W * 2, HERO_RATIO_H * 2)).toBeNull()
  })

  it("2000×750 這種寬版要擋下來，而且講得出實際尺寸", () => {
    const msg = heroRatioProblem(2000, 750)
    expect(msg).toContain("2000×750")
    expect(msg).toContain(`${HERO_RATIO_W}×${HERO_RATIO_H}`)
  })

  it("正方形、直式都擋", () => {
    expect(heroRatioProblem(1000, 1000)).not.toBeNull()
    expect(heroRatioProblem(1080, 1920)).not.toBeNull()
  })

  it("讀不到尺寸時擋下來，不要當作通過", () => {
    expect(heroRatioProblem(0, 0)).not.toBeNull()
  })
})
