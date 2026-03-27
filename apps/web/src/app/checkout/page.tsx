"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/lib/cart"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type AddressType = "home" | "cvs"
type ShippingMethod = "711" | "family" | "home_delivery"

const SHIPPING_LABELS: Record<ShippingMethod, string> = {
  "711": "7-11取貨",
  "family": "全家取貨",
  "home_delivery": "宅配",
}

export default function CheckoutPage() {
  const router = useRouter()
  const items = useCart(s => s.items)
  const total = useCart(s => s.total)
  const [hydrated, setHydrated] = useState(false)

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [addressType, setAddressType] = useState<AddressType>("home")
  const [city, setCity] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("home_delivery")

  useEffect(() => {
    useCart.persist.rehydrate()
    setHydrated(true)
  }, [])

  function handleNext() {
    if (!name || !phone) return
    const checkoutData = {
      items,
      address: { name, phone, addressType, city, postalCode },
      shippingMethod,
    }
    localStorage.setItem("realreal-checkout", JSON.stringify(checkoutData))
    router.push("/checkout/payment")
  }

  if (!hydrated) return null

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">結帳</h1>

      {/* Cart Summary */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">購物車明細</h2>
        {items.length === 0 ? (
          <p className="text-zinc-500">購物車是空的</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {items.map(item => (
              <div key={item.variantId} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium text-sm">{item.productName}</p>
                  <p className="text-xs text-zinc-500">{item.variantName} × {item.qty}</p>
                </div>
                <p className="font-medium">NT$ {(item.price * item.qty).toLocaleString()}</p>
              </div>
            ))}
            <div className="flex justify-between p-3 font-semibold">
              <span>小計</span>
              <span>NT$ {total().toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Address Form */}
      <div className="mb-8 space-y-4">
        <h2 className="text-lg font-semibold">收件資訊</h2>

        <div className="space-y-2">
          <Label htmlFor="name">姓名</Label>
          <Input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="收件人姓名"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">電話</Label>
          <Input
            id="phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="手機號碼"
          />
        </div>

        <div className="space-y-2">
          <Label>地址類型</Label>
          <div className="flex gap-3">
            {(["home", "cvs"] as AddressType[]).map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="addressType"
                  value={type}
                  checked={addressType === type}
                  onChange={() => setAddressType(type)}
                  className="h-4 w-4"
                />
                <span>{type === "home" ? "住家" : "超商"}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="city">縣市</Label>
            <Input
              id="city"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="台北市"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">郵遞區號</Label>
            <Input
              id="postalCode"
              value={postalCode}
              onChange={e => setPostalCode(e.target.value)}
              placeholder="100"
            />
          </div>
        </div>
      </div>

      {/* Shipping Method */}
      <div className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">配送方式</h2>
        <div className="space-y-2">
          {(Object.entries(SHIPPING_LABELS) as [ShippingMethod, string][]).map(([value, label]) => (
            <label key={value} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors">
              <input
                type="radio"
                name="shippingMethod"
                value={value}
                checked={shippingMethod === value}
                onChange={() => setShippingMethod(value)}
                className="h-4 w-4"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleNext}
        disabled={items.length === 0 || !name || !phone}
      >
        下一步
      </Button>
    </div>
  )
}
