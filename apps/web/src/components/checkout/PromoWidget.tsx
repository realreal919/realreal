"use client"

/**
 * PromoWidget — checkout step 1's promo entry (coupon + points + member discount).
 *
 * Why this lives at step 1 (not step 2 like the original payment page):
 * Baymard Institute research on cart abandonment ranks "could not see total
 * cost upfront" as the #1 reason (~50%). Surfacing promo entry BEFORE the
 * user invests time typing address details lifts conversion. Industry
 * standard (Amazon / Shopify / Shopee / Momo) all keep payment-gateway
 * selection at step 2 (it interlocks with shipping method) but expose the
 * discount-application surface at step 1 or in the cart drawer.
 *
 * State is persisted to localStorage under `PROMO_KEY` and broadcast via the
 * `realreal-promo-change` CustomEvent. The payment page reads the same key
 * on mount to restore the applied promo, and the order-summary sidebars on
 * both step 1 and step 2 subscribe to the CustomEvent so they refresh
 * without prop drilling.
 *
 * IMPORTANT: This widget calls /coupons/validate and /points/apply for the
 * display discount amount. The server canonical recompute happens at
 * POST /orders (orders.ts). Race on coupon used_count is handled there via
 * atomic_increment_coupon_usage RPC; here we may briefly show a discount the
 * server later rejects — that case is rare and the order endpoint will fall
 * back gracefully (silently skip the coupon).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { API_URL } from "@/lib/api-url"
import {
  clearReferralCookie,
  normalizeReferralCode,
  readReferralCookie,
  writeReferralCookie,
} from "@/lib/referral-code"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export const PROMO_KEY = "realreal-checkout-promo"
export const PROMO_EVENT = "realreal-promo-change"
export const PROMO_TTL_MS = 30 * 60 * 1000

export type PromoState = {
  couponCode: string
  couponApplied: boolean
  couponDiscount: number // dollars
  couponError: string
  pointsInput: string
  pointsBalance: number
  pointsUsed: number
  pointsDiscount: number // dollars
  pointsAllowed: boolean
  pointsReason: string
  pointsRatio: number
  allowCouponStack: boolean
  /** 認出來的推薦碼。跟優惠碼共用一個輸入框，但不互斥——見下方 applyPromoCode 的說明。 */
  referralCode: string
  /** 推薦碼被擋下來的理由（例：自己的碼、已經買過）。 */
  referralNote: string
  memberDiscountRate: number // 0..1
  tierName: string | null
  subtotalAtApply: number
  expiresAt: number
}

const DEFAULT_PROMO: PromoState = {
  couponCode: "",
  couponApplied: false,
  couponDiscount: 0,
  couponError: "",
  pointsInput: "",
  pointsBalance: 0,
  pointsUsed: 0,
  pointsDiscount: 0,
  pointsAllowed: true,
  pointsReason: "",
  pointsRatio: 1,
  allowCouponStack: true,
  referralCode: "",
  referralNote: "",
  memberDiscountRate: 0,
  tierName: null,
  subtotalAtApply: 0,
  expiresAt: 0,
}

export function readPromoState(): PromoState {
  if (typeof window === "undefined") return DEFAULT_PROMO
  try {
    const raw = localStorage.getItem(PROMO_KEY)
    if (!raw) return DEFAULT_PROMO
    const parsed = JSON.parse(raw) as PromoState
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      localStorage.removeItem(PROMO_KEY)
      return DEFAULT_PROMO
    }
    return { ...DEFAULT_PROMO, ...parsed }
  } catch {
    return DEFAULT_PROMO
  }
}

function writePromoState(s: PromoState) {
  if (typeof window === "undefined") return
  try {
    const withTtl: PromoState = { ...s, expiresAt: Date.now() + PROMO_TTL_MS }
    localStorage.setItem(PROMO_KEY, JSON.stringify(withTtl))
    window.dispatchEvent(new CustomEvent(PROMO_EVENT))
  } catch {
    // Quota exceeded / private browsing — promo just won't persist; UX still works in-page.
  }
}

export function clearPromoState() {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(PROMO_KEY)
    window.dispatchEvent(new CustomEvent(PROMO_EVENT))
  } catch {}
}

export function PromoWidget({ subtotal }: { subtotal: number }) {
  const [state, setState] = useState<PromoState>(DEFAULT_PROMO)
  const [hydrated, setHydrated] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [couponLoading, setCouponLoading] = useState(false)
  // 輸入框的值跟「已套用的碼」分開。共用一個欄位的話，套用完成後框裡還留著
  // 那組碼，客人要再打推薦碼得先手動清掉。
  const [codeInput, setCodeInput] = useState("")
  const lastSubtotalRef = useRef(0)

  // Restore from localStorage on mount
  useEffect(() => {
    const restored = readPromoState()
    // 從邀請連結進來的人沒打過任何碼，但 cookie 裡有 —— 也要看得到。
    // 不顯示的話他沒有任何跡象可以知道朋友的推薦有沒有被認到。
    const fromLink = readReferralCookie()
    setState(fromLink && !restored.referralCode ? { ...restored, referralCode: fromLink } : restored)
    setHydrated(true)
  }, [])

  // 帶進來的推薦碼要先驗過才能承諾獎勵。
  //
  // 自己點自己的邀請連結、或已經買過的人，下單時後端會擋下來，
  // 但結帳頁還是寫著「雙方各得 50 元」—— 那筆錢不會發，等於在最後一步騙人。
  useEffect(() => {
    if (!hydrated || !state.referralCode) return
    let cancelled = false
    ;(async () => {
      const reason = await tryReferralCode(state.referralCode)
      if (cancelled || reason === null) return
      // 不成立：清掉 cookie 並把理由講出來，不要默默消失
      clearReferralCookie()
      setState(s => ({
        ...s,
        referralCode: "",
        referralNote: reason || "這組推薦碼無法用於這筆訂單",
      }))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, state.referralCode])

  // Persist on every state change (after hydration so we don't clobber stored state on mount)
  useEffect(() => {
    if (!hydrated) return
    writePromoState(state)
  }, [state, hydrated])

  // Fetch member discount + points balance on mount (auth users only)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token || cancelled) return
        setIsLoggedIn(true)
        const headers = { Authorization: `Bearer ${session.access_token}` }
        const [memberRes, pointsRes] = await Promise.all([
          fetch(`${API_URL}/my-member-discount`, { headers }),
          fetch(`${API_URL}/points/balance`, { headers }),
        ])
        if (cancelled) return
        const updates: Partial<PromoState> = {}
        if (memberRes.ok) {
          const m = await memberRes.json() as { data?: { discountRate?: number; tierName?: string | null } }
          if (m?.data?.discountRate && m.data.discountRate > 0) {
            updates.memberDiscountRate = m.data.discountRate
            updates.tierName = m.data.tierName ?? null
          }
        }
        if (pointsRes.ok) {
          const p = await pointsRes.json() as {
            data?: { balance?: number; ratio?: number; allow_coupon_stack?: boolean }
          }
          updates.pointsBalance = Math.max(0, p?.data?.balance ?? 0)
          if (typeof p?.data?.ratio === "number") updates.pointsRatio = p.data.ratio
          if (typeof p?.data?.allow_coupon_stack === "boolean") updates.allowCouponStack = p.data.allow_coupon_stack
        }
        if (Object.keys(updates).length > 0 && !cancelled) {
          setState(s => ({ ...s, ...updates }))
        }
      } catch {
        // Silently fail — promos are optional
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Re-validate coupon when subtotal changes (cart edits after coupon applied)
  const applyCouponCore = useCallback(async (codeRaw: string, currentSubtotal: number) => {
    const code = codeRaw.trim()
    if (!code) {
      setState(s => ({ ...s, couponError: "請輸入優惠碼或推薦碼" }))
      return
    }
    setCouponLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`${API_URL}/coupons/validate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ code, order_amount: currentSubtotal }),
      })
      if (!res.ok) {
        // 不是優惠碼，再試試是不是朋友的推薦碼。先查優惠碼是因為它影響這一單的
        // 金額，而且碼是店主自己建的 —— 搬不動的那一個要優先。
        // 專屬回購券（信裡的優惠碼）。它本來就會自動帶入，打不打都一樣折得到，
        // 但信上印了那組碼，客人一定會打 —— 打進去得到「無效的優惠碼」比沒印還糟。
        const memberMsg = await tryMemberCoupon(code)
        if (memberMsg !== "") {
          setCodeInput("")
          setState(s => ({ ...s, couponError: memberMsg }))
          return
        }
        const referralMsg = await tryReferralCode(code)
        if (referralMsg === null) {
          setCodeInput("")
          setState(s => ({ ...s, referralCode: code, couponError: "", referralNote: "" }))
          return
        }
        // 推薦碼格式對但用不了（未登入、自己的碼…）：用橘色提示，不要用紅字報錯。
        // 這不是他打錯了，是條件不符，而且有解法。
        if (referralMsg) {
          setCodeInput("")
          setState(s => ({ ...s, referralNote: referralMsg, couponError: "" }))
          return
        }
        const body = await res.json().catch(() => ({ error: "無效的優惠碼" }))
        setState(s => ({
          ...s,
          // 推薦碼格式對但不成立時，講推薦碼的理由比講「無效的優惠碼」有用
          couponError: referralMsg || ((body as { error?: string }).error ?? "無效的優惠碼"),
          couponApplied: false,
          couponDiscount: 0,
        }))
        return
      }
      const body = await res.json() as { data?: { discount?: number } }
      const discountAmount = body?.data?.discount ?? 0
      setCodeInput("")
      setState(s => ({
        ...s,
        couponCode: code,
        couponDiscount: discountAmount,
        couponApplied: true,
        couponError: "",
        subtotalAtApply: currentSubtotal,
      }))
    } catch {
      setState(s => ({ ...s, couponError: "驗證優惠碼時發生錯誤", couponApplied: false, couponDiscount: 0 }))
    } finally {
      setCouponLoading(false)
    }
  }, [])

  // Subtotal changed after coupon was applied → silently revalidate
  useEffect(() => {
    if (!hydrated) return
    if (!state.couponApplied) {
      lastSubtotalRef.current = subtotal
      return
    }
    if (lastSubtotalRef.current === subtotal) return
    if (subtotal === state.subtotalAtApply) {
      lastSubtotalRef.current = subtotal
      return
    }
    lastSubtotalRef.current = subtotal
    void applyCouponCore(state.couponCode, subtotal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, hydrated, state.couponApplied])

  /**
   * 這組碼是不是推薦碼。
   *
   * 回 null 代表成立（已寫入 cookie，結帳時會帶進 POST /orders），
   * 回字串代表「看起來是推薦碼但不能用」的理由，回空字串代表根本不是推薦碼。
   */
  async function tryReferralCode(code: string): Promise<string | null | ""> {
    if (!normalizeReferralCode(code)) return ""
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      // 不重複放註冊／登入的連結 —— 這個畫面下方本來就有「立即免費加入」與
      // 「已經是會員了嗎」兩張卡片。訊息負責指路，不負責再做一組按鈕。
      if (!session?.access_token)
        return "推薦碼要有會員帳號才能使用——回饋是記在帳號裡的。可以用下方的「立即免費加入」建立帳號，回來再輸入一次就行。"
      const res = await fetch(`${API_URL}/referral/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code }),
      })
      const body = await res.json().catch(() => ({})) as { valid?: boolean; code?: string; reason?: string }
      if (!res.ok) return ""
      if (!body.valid) return body.reason ?? ""
      writeReferralCookie(body.code ?? code)
      return null
    } catch {
      return ""
    }
  }

  /**
   * 這組碼是不是他自己的回購券。
   *
   * 回空字串代表「不是」（讓呼叫端繼續往下試），其餘都是要顯示給客人的話。
   */
  async function tryMemberCoupon(code: string): Promise<string> {
    if (!/^[A-Za-z]{2}[0-9A-Za-z]{6}$/.test(code.replace(/[\s\-_]/g, ""))) return ""
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return ""
      const res = await fetch(`${API_URL}/referral/member-coupon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code }),
      })
      const body = await res.json().catch(() => ({})) as
        { valid?: boolean; amount?: number; min_order?: number; reason?: string }
      if (!res.ok) return ""
      if (!body.valid) return body.reason ?? ""
      return body.min_order
        ? `✓ 已認到您的回購券：滿 ${body.min_order.toLocaleString()} 元折 ${body.amount} 元，結帳時自動帶入，不必再做任何事。`
        : `✓ 已認到您的回購券：折 ${body.amount} 元，結帳時自動帶入。`
    } catch {
      return ""
    }
  }

  function handleRemoveReferral() {
    clearReferralCookie()
    setState(s => ({ ...s, referralCode: "" }))
  }

  function handleRemoveCoupon() {
    setState(s => ({ ...s, couponCode: "", couponApplied: false, couponDiscount: 0, couponError: "" }))
  }

  // Debounced points apply
  useEffect(() => {
    if (!hydrated) return
    if (state.pointsBalance === 0) return
    const blocked = state.couponApplied && !state.allowCouponStack
    if (blocked) {
      if (state.pointsUsed !== 0 || state.pointsDiscount !== 0) {
        setState(s => ({ ...s, pointsUsed: 0, pointsDiscount: 0, pointsReason: "" }))
      }
      return
    }
    const requested = Number.parseInt(state.pointsInput, 10)
    if (!Number.isFinite(requested) || requested <= 0) {
      if (state.pointsUsed !== 0 || state.pointsDiscount !== 0) {
        setState(s => ({ ...s, pointsUsed: 0, pointsDiscount: 0, pointsReason: "" }))
      }
      return
    }
    const handle = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const cart = { subtotal, shipping: 0, total: subtotal, sale_item_total: 0 }
        const res = await fetch(`${API_URL}/points/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ requested, cart }),
        })
        if (!res.ok) {
          setState(s => ({ ...s, pointsAllowed: false, pointsReason: "無法套用點數", pointsUsed: 0, pointsDiscount: 0 }))
          return
        }
        const body = await res.json() as { data?: { discount?: number; allowed?: boolean; reason?: string } }
        const allowed = body?.data?.allowed ?? false
        const d = body?.data?.discount ?? 0
        const reason = body?.data?.reason ?? ""
        if (allowed) {
          setState(s => ({ ...s, pointsAllowed: true, pointsReason: reason, pointsUsed: requested, pointsDiscount: d }))
        } else {
          setState(s => ({ ...s, pointsAllowed: false, pointsReason: reason, pointsUsed: 0, pointsDiscount: 0 }))
        }
      } catch {
        setState(s => ({ ...s, pointsAllowed: false, pointsReason: "套用點數時發生錯誤", pointsUsed: 0, pointsDiscount: 0 }))
      }
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pointsInput, state.couponApplied, state.allowCouponStack, subtotal, state.pointsBalance, hydrated])

  if (!hydrated) {
    return (
      <section className="rounded-lg border bg-white p-4">
        <p className="text-sm text-zinc-400">載入折抵與點數中…</p>
      </section>
    )
  }

  const pointsBlockedByCoupon = state.couponApplied && !state.allowCouponStack
  const memberDiscountAmount = Math.round(subtotal * state.memberDiscountRate)

  return (
    <section className="rounded-lg border bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">💰 折抵與優惠</h2>
      </div>

      {/* Member discount — auto-applied, no input */}
      {state.tierName && state.memberDiscountRate > 0 && (
        <div className="flex items-center justify-between rounded bg-emerald-50 border border-emerald-200 p-3 text-sm">
          <span>
            👑 <strong>{state.tierName}</strong> {Math.round(state.memberDiscountRate * 100)}% off
            <span className="text-emerald-700 ml-2 text-xs">(自動套用)</span>
          </span>
          <span className="text-emerald-700 font-semibold">- NT$ {memberDiscountAmount.toLocaleString()}</span>
        </div>
      )}

      {/* Coupon / referral section —— 一個輸入框，打什麼系統自己認。
          兩種碼不互斥：優惠碼折這一單的錢，推薦碼只是記下「誰介紹你來的」。
          強制擇一的話，客人當然選折現的那個，推薦人就什麼都拿不到，而且永遠
          不會知道為什麼。 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">🎟 優惠碼／推薦碼</Label>
          <span className="text-xs text-zinc-500">優惠碼區分大小寫，推薦碼不分</span>
        </div>

        {/* 這張籤講的是「介紹您來的人的碼」，不是會員自己的。原本寫「推薦碼 XXX」，
            客人會誤以為是自己的碼拿去分享。 */}
        {state.referralCode && (
          <div className="flex items-center justify-between rounded border border-[#10305a]/20 bg-[#10305a]/5 p-3 text-sm">
            <span>
              已套用<strong>朋友的推薦碼</strong> <strong>{state.referralCode}</strong>
              <span className="ml-2 text-[#687279]">完成首購後，您與朋友各得 50 元公益存款</span>
            </span>
            <button
              type="button"
              onClick={handleRemoveReferral}
              className="text-xs text-red-600 hover:underline"
            >
              移除
            </button>
          </div>
        )}

        {state.referralNote && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
            {state.referralNote}
          </p>
        )}
        {state.couponApplied && (
          <div className="flex items-center justify-between rounded bg-emerald-50 border border-emerald-200 p-3 text-sm">
            <span>
              <strong>{state.couponCode}</strong>
              <span className="text-emerald-700 ml-2">已套用</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="text-emerald-700 font-semibold">- NT$ {state.couponDiscount.toLocaleString()}</span>
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="text-xs text-red-600 hover:underline"
              >
                移除
              </button>
            </div>
          </div>
        )}
        {/* 優惠碼套用後輸入框不收起來 —— 兩種碼可以並存，
            收起來的話想再打推薦碼就得先把優惠碼移除。 */}
        <div className="flex gap-2">
          <Input
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value)
              if (state.couponError || state.referralNote) {
                setState(s => ({ ...s, couponError: "", referralNote: "" }))
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void applyCouponCore(codeInput, subtotal)
              }
            }}
            placeholder="輸入優惠碼或推薦碼"
            className="flex-1"
          />
          <Button
            type="button"
            onClick={() => void applyCouponCore(codeInput, subtotal)}
            disabled={couponLoading || !codeInput.trim()}
          >
            {couponLoading ? "驗證中…" : "套用"}
          </Button>
        </div>
        {state.couponError && <p className="text-xs text-red-600">{state.couponError}</p>}
      </div>

      {/* Points section */}
      {isLoggedIn ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">✨ 公益存款</Label>
              {state.pointsBalance > 0 && (
                <span className="text-xs text-zinc-500">可選擇折抵消費或留作公益</span>
              )}
            </div>
            <span className="text-xs text-zinc-500">
              餘額 <strong>{state.pointsBalance.toLocaleString()}</strong> 點
              {state.pointsBalance > 0 && (
                <span className="text-zinc-400 ml-1">(= NT$ {Math.floor(state.pointsBalance * state.pointsRatio).toLocaleString()})</span>
              )}
            </span>
          </div>
          {state.pointsBalance === 0 ? (
            <p className="text-xs text-zinc-500 leading-relaxed">
              累積消費可獲得公益點數，下次購物可折抵金額。
            </p>
          ) : pointsBlockedByCoupon ? (
            <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-700">
              已使用優惠券，無法同時使用點數
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max={state.pointsBalance}
                  value={state.pointsInput}
                  onChange={(e) => setState(s => ({ ...s, pointsInput: e.target.value }))}
                  placeholder="輸入要使用的點數"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setState(s => ({ ...s, pointsInput: String(s.pointsBalance) }))}
                >
                  全部使用
                </Button>
              </div>
              {state.pointsReason && !state.pointsAllowed && (
                <p className="text-xs text-amber-700">{state.pointsReason}</p>
              )}
              {state.pointsDiscount > 0 && state.pointsAllowed && (
                <p className="text-xs text-emerald-700">
                  將折抵 <strong>- NT$ {state.pointsDiscount.toLocaleString()}</strong>
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        /* Guest: informational card to introduce 公益存款 and encourage sign-up */
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "#10305a" }}>✨ 公益存款</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: "#10305a" }}>
              會員專屬
            </span>
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed">
            成為誠真會員，每次消費自動累積<strong>公益存款點數</strong>。<br />
            點數可折抵下次購物，也可選擇留存為公益捐款，讓消費也能做好事。
          </p>
          <a
            href="/auth/register"
            className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
            style={{ color: "#10305a" }}
          >
            立即免費加入，開始累積點數 →
          </a>
        </div>
      )}
    </section>
  )
}
