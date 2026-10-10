/**
 * 極簡的滑動視窗頻率限制。放在記憶體裡，沒有外部依賴。
 *
 * 用途很窄：擋住「拿某支端點當工具，一秒鐘試幾十個值」這種行為。它不是
 * 完整的防護 —— 服務如果擴成多個執行個體，每個都有自己的計數。但對帳號
 * 列舉來說已經夠了：要把幾萬個 email 試完，速度被壓到這個程度就不划算。
 *
 * 真的需要跨執行個體的限制時要改用 Redis（站上本來就有一台）。現在不做是
 * 因為 API 只跑一個執行個體，多那一層的複雜度換不到實際的保護。
 */
export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number }

type Window = { hits: number[]; }

export class RateLimiter {
  private readonly buckets = new Map<string, Window>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** 超過幾個 key 就清掉過期的，避免記憶體無限長大 */
    private readonly sweepEvery = 500,
  ) {}

  check(key: string, now = Date.now()): RateLimitResult {
    if (this.buckets.size > this.sweepEvery) this.sweep(now)

    const cutoff = now - this.windowMs
    const bucket = this.buckets.get(key) ?? { hits: [] }
    bucket.hits = bucket.hits.filter((t) => t > cutoff)

    if (bucket.hits.length >= this.limit) {
      this.buckets.set(key, bucket)
      // 最舊的那一次離開視窗，就能再試一次
      const retryAfterSec = Math.max(1, Math.ceil((bucket.hits[0] - cutoff) / 1000))
      return { allowed: false, retryAfterSec }
    }

    bucket.hits.push(now)
    this.buckets.set(key, bucket)
    return { allowed: true }
  }

  private sweep(now: number): void {
    const cutoff = now - this.windowMs
    for (const [key, bucket] of this.buckets) {
      const live = bucket.hits.filter((t) => t > cutoff)
      if (live.length === 0) this.buckets.delete(key)
      else bucket.hits = live
    }
  }

  /** 測試用。 */
  reset(): void {
    this.buckets.clear()
  }
}
