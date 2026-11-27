import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { HeroCarousel } from "../HeroCarousel"

// next/image 在 jsdom 會去跑 loader；主視覺輪播要測的是輪播行為，不是 next 的縮圖。
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />,
}))

const A = { src: "/a.webp", alt: "" }
const B = { src: "/b.webp", alt: "第三方檢驗未檢出" }

beforeEach(() => {
  // jsdom 沒有實作 Element.scrollTo，也永遠量不到寬度。
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 1000, configurable: true })
})

describe("HeroCarousel", () => {
  // 註：alt="" 的那張在無障礙樹上是 presentation 不是 img（那正是「純裝飾」
  // 要的效果），所以這裡數的是 DOM 裡的 <img>，不是 role。
  it("只有一張時不出現輪播的箭頭與圓點", () => {
    const { container } = render(<HeroCarousel slides={[A]} ratioW={1672} ratioH={941} />)
    expect(container.querySelectorAll("img")).toHaveLength(1)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("多張時每張一個圓點，而且帶得動", () => {
    const { container } = render(<HeroCarousel slides={[A, B]} ratioW={1672} ratioH={941} />)
    expect(container.querySelectorAll("img")).toHaveLength(2)
    const dot2 = screen.getByRole("button", { name: "切到第 2 張" })
    fireEvent.click(dot2)
    expect(Element.prototype.scrollTo).toHaveBeenCalledWith({ left: 1000, behavior: "smooth" })
  })

  it("最後一張按下一張會回到第一張", () => {
    const { container } = render(<HeroCarousel slides={[A, B]} ratioW={1672} ratioH={941} />)
    const track = container.querySelector("div[class*='overflow-x-auto']")!
    // 捲到第二張：目前在第幾張是看捲動位置算的，不是另外存一份狀態
    Object.defineProperty(track, "scrollLeft", { value: 1000, configurable: true })
    fireEvent.scroll(track)
    fireEvent.click(screen.getByRole("button", { name: "下一張" }))
    expect(Element.prototype.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" })
  })

  it("圖上有資訊的那張要把 alt 帶出去（純裝飾的留空）", () => {
    render(<HeroCarousel slides={[A, B]} ratioW={1672} ratioH={941} />)
    expect(screen.getByAltText("第三方檢驗未檢出")).toBeInTheDocument()
  })
})
