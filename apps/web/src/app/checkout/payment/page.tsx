"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/lib/cart"
import { Button } from "@/components/ui/button"

type PaymentMethod = "pchomepay" | "linepay" | "jkopay"

type PaymentOption = {
  value: PaymentMethod
  label: string
  icon: string
  note?: string
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: "pchomepay", label: "PChomePay 支付連", icon: "💳" },
  { value: "linepay", label: "LINE Pay", icon: "💚", note: "不支援定期訂閱扣款" },
  { value: "jkopay", label: "街口支付 JKOPay", icon: "🟠", note: "不支援定期訂閱扣款" },
]

type CheckoutData = {
  items: { variantId: string; productName: string; variantName: string; price: number; qty: number }[]
  address: { name: string; phone: string; addressType: string; city: string; postalCode: string }
  shippingMethod: string
}

export default function PaymentPage() {
  const router = useRouter()
  const clearCart = useCart(s => s.clear)
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pchomepay")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem("realreal-checkout")
    if (!raw) {
      router.replace("/checkout")
      return
    }
    try {
      setCheckoutData(JSON.parse(raw) as CheckoutData)
    } catch {
      router.replace("/checkout")
    }
  }, [router])

  const total = checkoutData
    ? checkoutData.items.reduce((sum, i) => sum + i.price * i.qty, 0)
    : 0

  async function handleConfirm() {
    if (!checkoutData) return
    setLoading(true)
    setError(null)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
      const res = await fetch(`${apiUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: checkoutData.items,
          address: checkoutData.address,
          shippingMethod: checkoutData.shippingMethod,
          paymentMethod,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "建立訂單失敗" }))
        throw new Error((body as { message?: string }).message ?? "建立訂單失敗")
      }

      const data = await res.json() as { data?: { id?: string; order_number?: string } }
      const orderNumber = data?.data?.order_number ?? data?.data?.id ?? "unknown"

      localStorage.removeItem("realreal-checkout")
      clearCart()
      router.push(`/checkout/confirm?order=${orderNumber}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "付款失敗，請稍後再試")
    } finally {
      setLoading(false)
    }
  }

  if (!checkoutData) return null

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">確認付款</h1>

      {/* Order Summary */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">訂單摘要</h2>
        <div className="border rounded-lg divide-y">
          {checkoutData.items.map(item => (
            <div key={item.variantId} className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium text-sm">{item.productName}</p>
                <p className="text-xs text-zinc-500">{item.variantName} × {item.qty}</p>
              </div>
              <p className="font-medium">NT$ {(item.price * item.qty).toLocaleString()}</p>
            </div>
          ))}
          <div className="flex justify-between p-3 font-semibold">
            <span>合計</span>
            <span>NT$ {total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Shipping Info */}
      <div className="mb-8 p-4 bg-zinc-50 rounded-lg text-sm space-y-1">
        <p><span className="text-zinc-500">收件人：</span>{checkoutData.address.name}</p>
        <p><span className="text-zinc-500">電話：</span>{checkoutData.address.phone}</p>
        <p><span className="text-zinc-500">縣市：</span>{checkoutData.address.city}</p>
      </div>

      {/* Payment Method */}
      <div className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">付款方式</h2>
        <div className="space-y-2">
          {PAYMENT_OPTIONS.map(option => (
            <label
              key={option.value}
              className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors"
            >
              <input
                type="radio"
                name="paymentMethod"
                value={option.value}
                checked={paymentMethod === option.value}
                onChange={() => setPaymentMethod(option.value)}
                className="h-4 w-4 mt-0.5"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span>{option.icon}</span>
                  <span className="font-medium">{option.label}</span>
                </div>
                {option.note && (
                  <p className="text-xs text-zinc-500 mt-0.5">{option.note}</p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <Button
        className="w-full"
        onClick={handleConfirm}
        disabled={loading}
      >
        {loading ? "處理中..." : "確認付款"}
      </Button>
    </div>
  )
}
