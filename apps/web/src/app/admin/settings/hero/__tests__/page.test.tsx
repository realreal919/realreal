import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import AdminHeroPage from "../page"

const upload = vi.fn()
const getPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://cdn.test/home/new.webp" } }))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
    storage: { from: () => ({ upload, getPublicUrl }) },
  }),
}))

const toastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/settings/hero" }))

/** 這個 key 除了 images 還有別的欄位 —— 存檔不能把它們洗掉。 */
const EXISTING = {
  heading: "自純淨中補給，在誠真中安心",
  cta_link: "/shop",
  image: "https://cdn.test/home/old.webp",
  images: [
    { src: "https://cdn.test/home/a.webp", alt: "" },
    { src: "https://cdn.test/home/b.webp", alt: "檢驗結果" },
  ],
}

function mockFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/admin/site-contents/")) {
      return { ok: true, json: async () => ({ data: JSON.parse(String(init?.body)) }) } as Response
    }
    return { ok: true, json: async () => ({ data: EXISTING }) } as Response
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

/** 讓 new Image() 回報我們指定的尺寸，才測得到比例守門。 */
function stubImageSize(width: number, height: number) {
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} })
  class FakeImg {
    naturalWidth = width
    naturalHeight = height
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_v: string) { setTimeout(() => this.onload?.(), 0) }
  }
  vi.stubGlobal("Image", FakeImg)
}

function pickFile(name = "banner.webp") {
  const file = new File(["x"], name, { type: "image/webp" })
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, "files", { value: [file], configurable: true })
  fireEvent.change(input)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("後台 首頁主視覺", () => {
  it("把目前的每一張列出來，第一張標成首頁先看到的那張", async () => {
    mockFetch()
    render(<AdminHeroPage />)
    await waitFor(() => expect(screen.getByText(/目前（2 張）/)).toBeInTheDocument())
    expect(screen.getByText(/第 1 張（首頁一打開先看到這張）/)).toBeInTheDocument()
    expect(screen.getByDisplayValue("檢驗結果")).toBeInTheDocument()
  })

  it("存檔會保留 heading／cta 這些同一個 key 的其他欄位", async () => {
    const fetchMock = mockFetch()
    render(<AdminHeroPage />)
    await waitFor(() => expect(screen.getByText(/目前（2 張）/)).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole("button", { name: /往後/ })[0])

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => String(c[0]).includes("/admin/site-contents/"))
      expect(put).toBeTruthy()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.value.heading).toBe(EXISTING.heading)
      expect(body.value.cta_link).toBe("/shop")
      expect(body.value.image).toBe(EXISTING.image)
      // 換了順序
      expect(body.value.images.map((s: { src: string }) => s.src)).toEqual([
        "https://cdn.test/home/b.webp",
        "https://cdn.test/home/a.webp",
      ])
    })
  })

  it("比例不符的圖擋下來，不上傳也不存檔", async () => {
    const fetchMock = mockFetch()
    stubImageSize(2000, 750)
    render(<AdminHeroPage />)
    await waitFor(() => expect(screen.getByText(/目前（2 張）/)).toBeInTheDocument())

    pickFile()

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(String(toastError.mock.calls[0][0])).toContain("2000×750")
    expect(upload).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/admin/site-contents/"))).toBe(false)
  })

  it("同比例不同尺寸（1920×1080）放行，上傳後接到最後一張", async () => {
    const fetchMock = mockFetch()
    stubImageSize(1920, 1080)
    upload.mockResolvedValue({ error: null })
    render(<AdminHeroPage />)
    await waitFor(() => expect(screen.getByText(/目前（2 張）/)).toBeInTheDocument())

    pickFile()

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => String(c[0]).includes("/admin/site-contents/"))
      expect(put).toBeTruthy()
      const body = JSON.parse(String((put![1] as RequestInit).body))
      expect(body.value.images).toHaveLength(3)
      expect(body.value.images[2].src).toBe("https://cdn.test/home/new.webp")
    })
    expect(upload).toHaveBeenCalled()
  })

  it("只剩一張時不給刪 —— 首頁不能沒有主視覺", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/admin/site-contents/")) {
        return { ok: true, json: async () => ({ data: JSON.parse(String(init?.body)) }) } as Response
      }
      return { ok: true, json: async () => ({ data: { image: "https://cdn.test/only.webp" } }) } as Response
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<AdminHeroPage />)
    await waitFor(() => expect(screen.getByText(/目前（1 張）/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /刪除/ }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("至少要留一張，首頁不能沒有主視覺"))
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/admin/site-contents/"))).toBe(false)
  })
})
