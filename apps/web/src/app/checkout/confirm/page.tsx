"use client"

import { useEffect, useRef, useState } from "react"
import { OrderReferralPrompt } from "@/components/checkout/OrderReferralPrompt"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { useCart } from "@/lib/cart"
import { Button } from "@/components/ui/button"
import { trackPurchase, type PurchaseItem } from "@/lib/analytics"
import { clearPromoState } from "@/components/checkout/PromoWidget"
import { GuestRegisterCard } from "@/components/checkout/GuestRegisterCard"
import { orderNotice, type OrderNotice } from "@/lib/order-notice"
import { createClient } from "@/lib/supabase/client"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

const STEPS = [
  { num: 1, label: "收件資訊" },
  { num: 2, label: "付款方式" },
  { num: 3, label: "確認訂單" },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <nav className="mb-8" aria-label="結帳步驟">
      <ol className="flex items-center justify-center gap-0">
        {STEPS.map((step, i) => {
          const isActive = step.num === current
          const isCompleted = step.num < current
          return (
            <li key={step.num} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    isActive
                      ? "text-white"
                      : isCompleted
                        ? "text-white/90"
                        : "bg-zinc-100 text-zinc-400"
                  }`}
                  style={isActive ? { backgroundColor: "#10305a" } : isCompleted ? { backgroundColor: "#10305a", opacity: 0.6 } : undefined}
                >
                  {isCompleted ? "✓" : step.num}
                </span>
                <span
                  className={`text-sm font-medium ${
                    isActive || isCompleted ? "text-foreground" : "text-zinc-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-3 h-px w-8 sm:w-12 ${
                    step.num < current ? "" : "bg-zinc-200"
                  }`}
                  style={step.num < current ? { backgroundColor: "rgba(16,48,90,0.4)" } : undefined}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * 「接下來會怎麼送」的說明。超商取貨、超商取貨付款、宅配各一份，由 orderNotice
 * 依取貨方式挑；挑不到就整塊不顯示（例如港澳，或取貨方式還沒載入）。
 */
function NoticeCard({ notice }: { notice: OrderNotice }) {
  return (
    <div className="mx-auto max-w-sm space-y-3 rounded-lg border bg-zinc-50 p-4 text-left text-sm">
      <p className="font-semibold text-zinc-800">📦 {notice.title}</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-zinc-600">
        {notice.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="border-t border-zinc-200 pt-3 text-zinc-500">{notice.closing}</p>
    </div>
  )
}

type PaymentStatus = "success" | "pending" | "failed" | "loading"

function deriveOrderNumber(sp: URLSearchParams): string | null {
  // LINE Pay redirect: ?order=<orderNumber>&status=success
  // PChomePay OrderResultURL: ?MerchantTradeNo=<orderNumber>&RtnCode=1
  // JKOPay result_url: ?merchant_trade_no=<orderNumber>
  return (
    sp.get("order") ||
    sp.get("MerchantTradeNo") ||
    sp.get("merchant_trade_no") ||
    sp.get("orderNumber") ||
    null
  )
}

function mapPaymentStatus(payment_status: string | undefined): PaymentStatus {
  if (payment_status === "paid" || payment_status === "captured") return "success"
  if (payment_status === "failed") return "failed"
  return "pending"
}

// Initial status computed from render-time inputs (no setState-in-effect):
//   - test_paid arrives already settled → success
//   - a gateway return with NO order number can't be polled; honor an explicit
//     ?status=failed / ?success=false, else show pending
//   - otherwise we have an order number to poll → loading
function initialPaymentStatus(
  sp: URLSearchParams,
  orderNumber: string,
  isTestPaid: boolean,
): PaymentStatus {
  if (isTestPaid) return "success"
  if (orderNumber === "---") {
    const explicit = sp.get("status")
    return explicit === "failed" || explicit === "fail" || sp.get("success") === "false"
      ? "failed"
      : "pending"
  }
  return "loading"
}

export default function ConfirmPage() {
  const searchParams = useSearchParams()
  const clearCart = useCart((s) => s.clear)
  const cleanedUp = useRef(false)

  const orderNumber = deriveOrderNumber(searchParams) ?? "---"
  const method = searchParams.get("method")
  const isCvsCod = method === "cvs_cod"
  const isTestPaid = method === "test_paid"
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(() =>
    initialPaymentStatus(searchParams, orderNumber, isTestPaid),
  )

  // Guest email + login state — populated by the same status endpoint that
  // drives payment_status polling. `guestEmail` is null unless the order is
  // still a guest order (server side: returns email only when user_id IS NULL,
  // so already-claimed orders never leak the address). `isLoggedIn` toggles
  // the GuestRegisterCard off for members — they have nothing to convert.
  const [guestEmail, setGuestEmail] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
  // 取貨方式決定要顯示哪一份「接下來會怎麼送」。URL 上的 method 是**付款**方式，
  // 問不出客人選的是超商還是宅配，所以要跟訂單狀態一起讀回來。
  const [shippingMethod, setShippingMethod] = useState<string | null>(null)
  // 訂單實收金額。GA4 的 purchase 事件要帶這個當 value —— 以前帶 0，
  // 等於報表上「有轉換、沒營收」。伺服器回來的才算數。
  const [orderTotal, setOrderTotal] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (!cancelled) setIsLoggedIn(!!data.user)
      } catch {
        /* anon user — keep isLoggedIn=false */
      }
    })()
    return () => { cancelled = true }
  }, [])

  // One-shot fetch of the order's guest_email — separate from the payment
  // status poll so cvs_cod / test_paid (which skip polling) also get it.
  // Re-fires when orderNumber changes; once the order is claimed, the API
  // returns null and the card hides itself.
  useEffect(() => {
    if (orderNumber === "---") return
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch(
          `${API_URL}/orders/by-number/${encodeURIComponent(orderNumber)}/status`,
        )
        if (!r.ok || cancelled) return
        const body = (await r.json()) as {
          data?: {
            guest_email?: string | null
            shipping_method?: string | null
            total?: number | string | null
          }
        }
        if (cancelled) return
        setGuestEmail(body.data?.guest_email ?? null)
        setShippingMethod(body.data?.shipping_method ?? null)
        const t = Number(body.data?.total)
        if (Number.isFinite(t)) setOrderTotal(t)
      } catch {
        /* network blip — silently leave guestEmail null */
      }
    })()
    return () => { cancelled = true }
  }, [orderNumber])

  // Card is eligible only when (a) we know the visitor isn't logged in,
  // (b) the order has a guest email server-side, and (c) we have an
  // orderNumber to prove ownership in the register-from-guest endpoint.
  const showGuestRegister =
    !isLoggedIn && !!guestEmail && orderNumber !== "---"

  const notice = orderNotice(shippingMethod, method)

  // Server-side truth: fetch the real payment_status from the API.
  // URL params from the gateway redirect can lie (a hostile redirect could
  // forge ?status=success), so we always trust the DB.
  //
  // Polling: webhook from PChomePay can race the redirect — user arrives
  // before payment_status flips to "paid". Poll every 3s for up to 2 min
  // so the user doesn't have to manually refresh.
  useEffect(() => {
    // CVS COD / test_paid：訂單無需線上付款確認，跳過 polling
    if (method === "cvs_cod" || method === "test_paid") return

    // No order number to poll — the initial status (set from URL params in the
    // useState initializer above) already reflects failed/pending; nothing to do.
    if (orderNumber === "---") return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const startedAt = Date.now()
    const MAX_POLL_MS = 2 * 60_000
    const INTERVAL_MS = 3_000

    async function tick() {
      if (cancelled) return
      try {
        const r = await fetch(
          `${API_URL}/orders/by-number/${encodeURIComponent(orderNumber)}/status`,
        )
        const res = r.ok ? await r.json() : null
        if (cancelled) return
        const ps = (res?.data?.payment_status as string | undefined) ?? undefined
        const polledTotal = Number(res?.data?.total)
        if (Number.isFinite(polledTotal)) setOrderTotal(polledTotal)
        const mapped = mapPaymentStatus(ps)
        setPaymentStatus(mapped)
        // Stop polling once we reach a terminal state OR the budget runs out.
        const terminal = mapped === "success" || mapped === "failed"
        const expired = Date.now() - startedAt > MAX_POLL_MS
        if (!terminal && !expired) {
          timer = setTimeout(tick, INTERVAL_MS)
        }
      } catch {
        if (cancelled) return
        // Network blip → keep polling within budget.
        if (Date.now() - startedAt > MAX_POLL_MS) {
          setPaymentStatus("pending")
        } else {
          timer = setTimeout(tick, INTERVAL_MS)
        }
      }
    }
    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [orderNumber, method])

  // 結帳品項的快照。下面那個清理 effect 會把 localStorage 的 realreal-checkout
  // 刪掉，而 effect 是照宣告順序跑的 —— 所以這支一定要排在它前面，否則 GA4 的
  // purchase 事件永遠拿不到品項，只剩一個沒有內容的轉換。
  const purchasedItems = useRef<PurchaseItem[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem("realreal-checkout")
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        items?: Array<{
          variantId?: string
          productName?: string
          variantName?: string
          price?: number
          qty?: number
        }>
      }
      purchasedItems.current = (parsed.items ?? []).map(i => ({
        // 快照裡沒有 SKU，用 variantId 當 item_id —— 它一樣能唯一對應到一個規格。
        sku: i.variantId ?? "",
        name: [i.productName, i.variantName].filter(Boolean).join(" ") || "（未知品項）",
        unit_price: Number(i.price) || 0,
        qty: Number(i.qty) || 0,
      }))
    } catch {
      // SSR、無痕模式或 JSON 壞掉 —— 沒有品項照樣送轉換，只是少了明細。
    }
  }, [])

  // Clear cart + checkout/promo storage ONLY on a confirmed success — never
  // while still loading, pending, or failed. The previous version cleared
  // unconditionally on mount, which emptied the cart even on a failed payment,
  // so the failed-branch "重新付款" button led to an empty cart → dead end.
  //
  // Success = the server reported payment_status paid/captured (paymentStatus
  // === "success"), OR a no-gateway method that arrives already-settled
  // (cvs_cod order created / test_paid sandbox). cvs_cod + test_paid already
  // clear the cart at submit time on the payment page; re-clearing here is
  // idempotent. Failure / cancel leaves the cart intact so retry works.
  useEffect(() => {
    if (cleanedUp.current) return
    const settled = paymentStatus === "success" || isCvsCod || isTestPaid
    if (!settled) return
    cleanedUp.current = true

    // Clear the zustand persisted cart
    clearCart()
    // Clear localStorage checkout data + promo state saved during checkout
    try {
      localStorage.removeItem("realreal-checkout")
    } catch {
      // ignore — SSR or storage unavailable
    }
    clearPromoState()
  }, [clearCart, paymentStatus, isCvsCod, isTestPaid])

  // Fire GA4 `purchase` event exactly once, after the server confirms the
  // payment succeeded (spec L §2). We deliberately wait for paymentStatus
  // === "success" rather than firing on mount so a forged ?status=success
  // redirect can't inflate revenue numbers.
  //
  // 金額等伺服器回來才送（orderTotal 跟 payment_status 來自同一個回應）。
  // 寧可晚一拍，也不要送出一筆 value=0 的轉換 —— 那會讓 GA4 的收益報表
  // 長期低估，而且事後無法回填。
  const purchaseFired = useRef(false)
  useEffect(() => {
    if (purchaseFired.current) return
    if (paymentStatus !== "success") return
    if (orderNumber === "---") return
    if (orderTotal === null) return
    // 客人重新整理完成頁就是一次新的頁面載入，useRef 會歸零 —— 擋不住重複送。
    // GA4 不保證會用 transaction_id 去重，所以同一筆訂單會被算成兩筆營收。
    // 用 localStorage 記住送過的訂單編號，跨載入也只送一次。
    const sentKey = `ga4-purchase-${orderNumber}`
    try {
      if (localStorage.getItem(sentKey)) {
        purchaseFired.current = true
        return
      }
      localStorage.setItem(sentKey, "1")
    } catch {
      // 無痕模式／storage 不可用：退回只擋同一次載入，寧可漏擋也不要不送。
    }
    purchaseFired.current = true
    trackPurchase({
      id: orderNumber,
      total: orderTotal,
      items: purchasedItems.current,
    })
  }, [paymentStatus, orderNumber, orderTotal])

  if (isCvsCod) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <StepIndicator current={3} />
        <div className="text-center space-y-6 py-8">
          <div className="text-6xl">🏪</div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">訂單已成立！</h1>
            <p className="text-zinc-500">
              訂單編號：<span className="font-mono font-medium">{orderNumber}</span>
            </p>
          </div>
          {notice && <NoticeCard notice={notice} />}
          {showGuestRegister && guestEmail && (
            <div className="max-w-sm mx-auto">
              <GuestRegisterCard email={guestEmail} orderNumber={orderNumber} />
            </div>
          )}
          <Link href="/shop">
            <Button variant="outline">繼續購物</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (paymentStatus === "loading") {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <StepIndicator current={3} />
        <div className="text-center py-10">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-[#10305a]" />
          <p className="text-sm text-zinc-500">確認付款狀態中…</p>
        </div>
      </div>
    )
  }

  if (paymentStatus === "failed") {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <StepIndicator current={3} />
        <div className="text-center">
          {/* Failed Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-10 w-10 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold mb-2">付款失敗</h1>
          <p className="text-zinc-500 mb-8">
            您的付款未能成功處理，請重新嘗試或選擇其他付款方式。
          </p>

          {orderNumber !== "---" && (
            <div className="rounded-lg border bg-zinc-50/50 p-6 mb-6 text-left">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">訂單編號</p>
              <p className="font-mono font-semibold text-lg">{orderNumber}</p>
            </div>
          )}

          <div className="space-y-3">
            <Link href="/checkout/payment" className="block">
              <Button className="w-full rounded-[10px]" style={{ backgroundColor: "#10305a", color: "#fff" }}>重新付款</Button>
            </Link>
            <Link href="/shop" className="block">
              <Button variant="outline" className="w-full rounded-[10px]" style={{ borderColor: "#10305a", color: "#10305a" }}>返回商店</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (paymentStatus === "pending") {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <StepIndicator current={3} />
        <div className="text-center">
          {/* Pending Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-100">
            <svg
              className="h-10 w-10 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold mb-2">付款確認中</h1>
          <p className="text-zinc-500 mb-8">
            您的訂單已建立，付款正在確認中。<br />
            確認完成後，我們會透過 Email 通知您。
          </p>

          {orderNumber !== "---" && (
            <div className="rounded-lg border bg-zinc-50/50 p-6 mb-6 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">訂單編號</p>
                  <p className="font-mono font-semibold text-lg">{orderNumber}</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
                  付款確認中
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Link href="/my-account/orders" className="block">
              <Button className="w-full rounded-[10px]" style={{ backgroundColor: "#10305a", color: "#fff" }}>查看我的訂單</Button>
            </Link>
            <Link href="/shop" className="block">
              <Button variant="outline" className="w-full rounded-[10px]" style={{ borderColor: "#10305a", color: "#10305a" }}>繼續購物</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // paymentStatus === "success"
  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <StepIndicator current={3} />

      <div className="text-center">
        {/* Success Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(16,48,90,0.1)" }}>
          <svg
            className="h-10 w-10"
            style={{ color: "#10305a" }}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-2">訂單已成立！</h1>
        <p className="text-zinc-500 mb-8">
          感謝您的購買，我們將盡快為您處理。<br />
          訂單確認信已寄送至您的電子信箱。
        </p>

        {/* Order Details Card */}
        <div className="rounded-lg border bg-zinc-50/50 p-6 mb-6 text-left space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">訂單編號</p>
              <p className="font-mono font-semibold text-lg">{orderNumber}</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
              處理中
            </span>
          </div>
        </div>

        {/* 線上付款的客人原本在這頁什麼都看不到 —— 選了超商取貨也不知道要等簡訊、
            要去門市拿。說明放在訂單編號下面、按鈕上面，是看完訂單號自然往下讀的位置。 */}
        {notice && (
          <div className="mb-6">
            <NoticeCard notice={notice} />
          </div>
        )}

        {showGuestRegister && guestEmail && (
          <div className="mb-6">
            <GuestRegisterCard email={guestEmail} orderNumber={orderNumber} />
          </div>
        )}

        <OrderReferralPrompt />

        {/* Actions */}
        <div className="space-y-3">
          <Link href="/my-account/orders" className="block">
            <Button className="w-full rounded-[10px]" style={{ backgroundColor: "#10305a", color: "#fff" }}>查看我的訂單</Button>
          </Link>
          <Link href="/shop" className="block">
            <Button variant="outline" className="w-full rounded-[10px]" style={{ borderColor: "#10305a", color: "#10305a" }}>繼續購物</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
