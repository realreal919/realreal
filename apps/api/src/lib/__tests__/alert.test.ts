/**
 * 錯誤通知的節流。
 *
 * 兩個方向都會出事：放太寬，一次錯誤風暴把寄信額度吃光，客人收不到訂單確認信；
 * 收太緊，錯誤默默消失，沒人知道線上壞了。所以「擋下來的要記起來、下一封帶出去」
 * 跟「6 小時只寄一封」一樣重要。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
// vi.mock 會被 hoist 到 import 之前，所以這裡用一般 import 就行，
// 不要用 top-level await import —— 那會讓 tsc 建置失敗，而建置失敗時舊版會繼續跑。
import { sendAlert, __resetAlertThrottle } from "../alert"

const sendEmail = vi.fn()
vi.mock("../email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  parseRecipients: (raw: string | null | undefined) => (raw ? [raw] : []),
}))
vi.mock("../settings", () => ({
  getSetting: async () => "ops@example.com",
  getSettingOrEnv: async () => "ops@example.com",
}))


const SIX_HOURS = 6 * 60 * 60 * 1000

function bodyOf(call: number): string {
  return String(sendEmail.mock.calls[call]?.[0]?.html ?? "")
}

describe("sendAlert 節流", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-11T00:00:00Z"))
    sendEmail.mockClear()
    sendEmail.mockResolvedValue(undefined)
    __resetAlertThrottle()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("第一封會寄出", async () => {
    await sendAlert({ title: "DB 連線失敗", body: "timeout", dedupeKey: "db" })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it("★ 6 小時內不管來幾個錯誤，都只寄一封", async () => {
    await sendAlert({ title: "A", body: "x", dedupeKey: "a" })
    for (let i = 0; i < 50; i++) {
      vi.setSystemTime(new Date(Date.now() + 60_000))
      await sendAlert({ title: `E${i}`, body: "x", dedupeKey: `e${i}` })
    }
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it("★ 被擋下的錯誤不會消失，會出現在下一封信裡", async () => {
    await sendAlert({ title: "A", body: "first", dedupeKey: "a" })
    await sendAlert({ title: "B", body: "x", dedupeKey: "b" })
    await sendAlert({ title: "B", body: "x", dedupeKey: "b" })
    await sendAlert({ title: "C", body: "x", dedupeKey: "c" })

    vi.setSystemTime(new Date(Date.now() + SIX_HOURS + 1000))
    await sendAlert({ title: "D", body: "later", dedupeKey: "d" })

    expect(sendEmail).toHaveBeenCalledTimes(2)
    const second = bodyOf(1)
    expect(second).toContain("被擋下的錯誤")
    expect(second).toContain("共 3 次")
    expect(second).toContain("b")
    expect(second).toContain("c")
  })

  it("摘要取走之後就清空，不會在下下封重複出現", async () => {
    await sendAlert({ title: "A", body: "x", dedupeKey: "a" })
    await sendAlert({ title: "B", body: "x", dedupeKey: "b" })

    vi.setSystemTime(new Date(Date.now() + SIX_HOURS + 1000))
    await sendAlert({ title: "C", body: "x", dedupeKey: "c" })
    vi.setSystemTime(new Date(Date.now() + SIX_HOURS + 1000))
    await sendAlert({ title: "D", body: "x", dedupeKey: "d" })

    expect(sendEmail).toHaveBeenCalledTimes(3)
    expect(bodyOf(2)).not.toContain("被擋下的錯誤")
  })

  it("6 小時過後恢復寄送", async () => {
    await sendAlert({ title: "A", body: "x", dedupeKey: "a" })
    vi.setSystemTime(new Date(Date.now() + SIX_HOURS + 1000))
    await sendAlert({ title: "A2", body: "x", dedupeKey: "a2" })
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it("★ 寄信本身失敗時不能往上丟 —— 呼叫端是 fire-and-forget", async () => {
    sendEmail.mockRejectedValueOnce(new Error("resend down"))
    await expect(
      sendAlert({ title: "A", body: "x", dedupeKey: "a" }),
    ).resolves.toBeUndefined()
  })
})
