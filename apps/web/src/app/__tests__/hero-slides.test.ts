import { describe, expect, it } from "vitest"
import { heroSlides } from "../page"

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
