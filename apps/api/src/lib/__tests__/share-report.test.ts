/**
 * 分享回報表單的驗證。
 *
 * 這個表單對會員的要求只有一句「貼連結或傳截圖」，所以驗證要守住的其實只有
 * 三件事：有可查證的內容、認得出是誰、不是機器人。
 */
import { describe, it, expect } from "vitest"
import { decodeScreenshot, validateShareReport } from "../share-report"

const member = { isMember: true }
const guest = { isMember: false }

describe("validateShareReport", () => {
  it("會員貼連結就能送出", () => {
    const r = validateShareReport({ link: "https://www.threads.net/@x/post/1" }, member)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.link).toContain("threads.net")
  })

  it("只有截圖也能送出（私人帳號、限動、純文字心得）", () => {
    const r = validateShareReport({ screenshot: "data:image/png;base64,AAAA" }, member)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.link).toBeNull()
  })

  it("★ 連結與截圖都沒有時擋下來，訊息就是客人看到的那句", () => {
    const r = validateShareReport({ message: "很好喝" }, member)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("請貼連結或上傳截圖")
  })

  it("★ 未登入必須留 Email，否則對不到人", () => {
    const r = validateShareReport({ link: "https://example.com/p" }, guest)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("Email")
  })

  it("未登入填了 Email 就放行，並轉成小寫", () => {
    const r = validateShareReport({ link: "https://example.com/p", email: "Me@Example.COM" }, guest)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.email).toBe("me@example.com")
  })

  it("Email 格式明顯不對時擋下", () => {
    const r = validateShareReport({ link: "https://example.com/p", email: "not-an-email" }, guest)
    expect(r.ok).toBe(false)
  })

  it("★ 不是 http(s) 的連結擋下 —— javascript: 之類不該進資料庫", () => {
    const r = validateShareReport({ link: "javascript:alert(1)" }, member)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("完整網址")
  })

  it("★ honeypot 命中時回專用訊號，呼叫端要假裝成功", () => {
    const r = validateShareReport({ link: "https://example.com/p", website: "bot" }, member)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("__silent__")
  })

  it("不限定社群平台 —— 部落格、YouTube 也算分享", () => {
    expect(validateShareReport({ link: "https://my.blog/post/1" }, member).ok).toBe(true)
  })

  it("想說的話可以留白", () => {
    const r = validateShareReport({ link: "https://example.com/p" }, member)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.message).toBeNull()
  })
})

describe("decodeScreenshot", () => {
  const png = "data:image/png;base64," + Buffer.from("hello").toString("base64")

  it("認得 PNG", () => {
    const r = decodeScreenshot(png)
    expect("error" in r).toBe(false)
    if (!("error" in r)) expect(r.ext).toBe("png")
  })

  it("★ 手機拍的 HEIC 也要收 —— 擋掉的話 iPhone 使用者傳不了", () => {
    const r = decodeScreenshot("data:image/heic;base64," + Buffer.from("x").toString("base64"))
    expect("error" in r).toBe(false)
  })

  it("不是圖片的格式擋下", () => {
    const r = decodeScreenshot("data:application/pdf;base64,AAAA")
    expect("error" in r).toBe(true)
  })

  it("★ 超過 5 MB 時要講清楚是太大，不是籠統的失敗", () => {
    const big = "data:image/jpeg;base64," + "A".repeat(8 * 1024 * 1024)
    const r = decodeScreenshot(big)
    expect("error" in r).toBe(true)
    if ("error" in r) expect(r.error).toContain("5 MB")
  })

  it("格式無法辨識時回錯誤而不是丟例外", () => {
    expect("error" in decodeScreenshot("不是 data url")).toBe(true)
  })
})
