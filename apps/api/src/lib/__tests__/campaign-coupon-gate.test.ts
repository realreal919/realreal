/**
 * 「輸入某組優惠碼才免運」—— 愛心蛋白粉得獎禮那張 300 元券要同時免運，而券本身
 * 只能有一種 type（fixed／percentage／free_shipping），表達不了「折 300 又免運」。
 * 做法是券給 300 元折扣，免運由一個綁在這張券上的 free_shipping 活動提供。
 *
 * 前提是 coupon_id 真的有被檢查。原本這道閘門只寫在 evalFreebie 裡，dispatcher
 * 沒有，所以一個設了 coupon_id 的 free_shipping 活動會對**每一筆訂單**生效 ——
 * 等於全站免運，而且沒有任何地方會報錯。這支測試就是釘住這件事。
 */
import { describe, it, expect } from "vitest"
import { couponGateBlocked, evaluateCampaign, type EvaluatorContext } from "../campaigns-evaluator"

const COUPON = "coupon-love300"

function shipCampaign(couponId: string | null) {
  return {
    id: "camp-love300-ship",
    name: "愛心蛋白粉得獎禮｜免運",
    type: "free_shipping",
    is_active: true,
    starts_at: "2026-11-01T00:00:00Z",
    ends_at: null,
    tier_id: null,
    coupon_id: couponId,
    config: { min_order_amount: 0 } as Record<string, unknown>,
  }
}

function ctx(couponId: string | null): EvaluatorContext {
  return {
    user: { id: "u1", tier_id: null, birthday: null, created_at: null },
    cart: { items: [], subtotal: 120, shipping_fee: 80, shipping_bucket: "cvs" },
    couponId,
  } as unknown as EvaluatorContext
}

describe("綁優惠碼的活動（dispatcher 層閘門）", () => {
  it("★ 沒輸入券：免運活動不生效", async () => {
    const r = await evaluateCampaign(shipCampaign(COUPON) as never, ctx(null))
    expect(r.applied).toBe(false)
    expect(r.zero_shipping).toBeFalsy()
  })

  it("★ 輸入別的券：免運活動不生效", async () => {
    const r = await evaluateCampaign(shipCampaign(COUPON) as never, ctx("coupon-other"))
    expect(r.applied).toBe(false)
    expect(r.zero_shipping).toBeFalsy()
  })

  it("★ 輸入對的券：免運生效，且不看消費門檻", async () => {
    const r = await evaluateCampaign(shipCampaign(COUPON) as never, ctx(COUPON))
    expect(r.applied).toBe(true)
    expect(r.zero_shipping).toBe(true)
  })

  it("沒綁券的免運活動行為不變（週六滿 666 那種）", async () => {
    const r = await evaluateCampaign(shipCampaign(null) as never, ctx(null))
    expect(r.applied).toBe(true)
    expect(r.zero_shipping).toBe(true)
  })

  it("閘門本身：有綁券才需要比對", () => {
    expect(couponGateBlocked(shipCampaign(null) as never, ctx(null))).toBeNull()
    expect(couponGateBlocked(shipCampaign(COUPON) as never, ctx(COUPON))).toBeNull()
    expect(couponGateBlocked(shipCampaign(COUPON) as never, ctx(null))).toContain("優惠碼")
  })
})
