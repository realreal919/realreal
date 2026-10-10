/**
 * 頻率限制。
 *
 * 這支的存在是為了讓「這個信箱有沒有註冊」的查詢不能被當成列舉工具 ——
 * 一旦放寬，整個防護就只剩下訊息寫法，而那擋不住腳本。
 */
import { describe, it, expect } from "vitest"
import { RateLimiter } from "../rate-limit"

describe("RateLimiter", () => {
  it("在上限之內都放行", () => {
    const rl = new RateLimiter(3, 60_000)
    for (let i = 0; i < 3; i++) expect(rl.check("a", 1000).allowed).toBe(true)
  })

  it("★ 超過上限就擋下來，並說還要等幾秒", () => {
    const rl = new RateLimiter(3, 60_000)
    for (let i = 0; i < 3; i++) rl.check("a", 1000)
    const r = rl.check("a", 1000)
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.retryAfterSec).toBeGreaterThan(0)
  })

  it("★ 不同的 key 各算各的 —— 一個人被擋不該影響其他人", () => {
    const rl = new RateLimiter(2, 60_000)
    rl.check("a", 1000)
    rl.check("a", 1000)
    expect(rl.check("a", 1000).allowed).toBe(false)
    expect(rl.check("b", 1000).allowed).toBe(true)
  })

  it("視窗過了就恢復", () => {
    const rl = new RateLimiter(2, 60_000)
    rl.check("a", 1000)
    rl.check("a", 1000)
    expect(rl.check("a", 1000).allowed).toBe(false)
    expect(rl.check("a", 62_000).allowed).toBe(true)
  })

  it("是滑動視窗，不是固定視窗 —— 視窗邊界不會一次放行兩倍的量", () => {
    const rl = new RateLimiter(2, 10_000)
    rl.check("a", 0)
    rl.check("a", 9_000)
    // 第一次在 t=0 的紀錄到 t=10001 才離開視窗
    expect(rl.check("a", 10_500).allowed).toBe(true)
    expect(rl.check("a", 10_600).allowed).toBe(false)
  })

  it("長期不用的 key 會被清掉，記憶體不會無限長大", () => {
    const rl = new RateLimiter(1, 1_000, 2)
    rl.check("a", 0)
    rl.check("b", 0)
    rl.check("c", 5_000)
    // a 與 b 的紀錄都過期了，sweep 之後它們應該能重新被放行
    expect(rl.check("a", 5_000).allowed).toBe(true)
  })
})
