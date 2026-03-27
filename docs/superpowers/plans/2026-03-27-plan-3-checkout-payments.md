# Plan 3: Checkout & Payments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full checkout funnel — cart state, checkout pages, order creation, PChomePay / LINE Pay / JKOPay payment integrations, ECPay logistics, and order status pages — so customers can place and track orders end-to-end.

**Architecture:** Cart state lives in Zustand (persisted to localStorage) on the client and syncs to the server on auth. Checkout is a multi-step flow in Next.js App Router (`/checkout` → `/checkout/payment` → `/checkout/confirm`). Order creation and all payment webhooks are handled by the Express API on Railway. Webhook handlers use timing-safe HMAC verification and idempotency guards (`webhook_events` table with `UNIQUE(gateway, merchant_trade_no)`).

**Tech Stack:** Next.js 15 App Router, Zustand, Zod, Express 5, Drizzle ORM, Supabase PostgreSQL, Upstash Redis (idempotency cache), PChomePay API, LINE Pay API v3, JKOPay API, ECPay Logistics API

**Spec:** `docs/superpowers/specs/2026-03-26-realreal-rewrite-design.md`

**Depends on:** Plan 1 (Foundation), Plan 2 (Product Catalog)

---

## File Map

```
realreal/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── checkout/
│   │       │   │   ├── page.tsx                        # Step 1: address + shipping
│   │       │   │   ├── payment/
│   │       │   │   │   └── page.tsx                    # Step 2: payment method selection
│   │       │   │   └── confirm/
│   │       │   │       └── page.tsx                    # Step 3: order summary + submit
│   │       │   └── my-account/
│   │       │       └── orders/
│   │       │           ├── page.tsx                    # Order list
│   │       │           └── [id]/
│   │       │               └── page.tsx                # Order detail + timeline
│   │       ├── components/
│   │       │   ├── cart/
│   │       │   │   ├── CartDrawer.tsx
│   │       │   │   ├── CartItem.tsx
│   │       │   │   └── CartSummary.tsx
│   │       │   └── checkout/
│   │       │       ├── AddressForm.tsx
│   │       │       ├── ShippingSelector.tsx
│   │       │       ├── PaymentMethodSelector.tsx
│   │       │       ├── OrderSummary.tsx
│   │       │       └── CvsStoreMap.tsx                 # ECPay CVS store picker widget
│   │       ├── lib/
│   │       │   └── stores/
│   │       │       └── cart.ts                         # Zustand cart store
│   │       └── __tests__/
│   │           └── cart.test.ts
│   └── api/
│       └── src/
│           ├── routes/
│           │   ├── orders.ts                           # POST /api/orders
│           │   ├── payments/
│           │   │   ├── pchomepay.ts                    # PChomePay initiate + return + webhook
│           │   │   ├── linepay.ts                      # LINE Pay initiate + confirm + cancel + webhook
│           │   │   └── jkopay.ts                       # JKOPay initiate + result + webhook
│           │   └── logistics/
│           │       └── ecpay.ts                        # ECPay logistics create + webhook
│           └── lib/
│               ├── payments/
│               │   ├── pchomepay.ts                    # PChomePay SDK wrapper
│               │   ├── linepay.ts                      # LINE Pay SDK wrapper
│               │   └── jkopay.ts                       # JKOPay SDK wrapper
│               ├── logistics/
│               │   └── ecpay.ts                        # ECPay Logistics SDK wrapper
│               └── webhook-guard.ts                    # Timing-safe signature verification helper
└── packages/
    └── db/
        └── src/schema/
            ├── orders.ts                               # orders, order_items, order_addresses tables
            ├── payments.ts                             # payment_transactions, webhook_events tables
            └── logistics.ts                            # logistics_records table
```

---

## Task 1: Cart State Management

**Goal:** Implement a Zustand cart store persisted to localStorage with guest checkout support and server sync on auth.

**Files:**
- Create: `apps/web/src/lib/stores/cart.ts`
- Create: `apps/web/src/components/cart/CartDrawer.tsx`
- Create: `apps/web/src/components/cart/CartItem.tsx`
- Create: `apps/web/src/components/cart/CartSummary.tsx`
- Create: `apps/web/src/lib/stores/__tests__/cart.test.ts`

- [ ] **Step 1: Write failing tests for cart store**

`apps/web/src/lib/stores/__tests__/cart.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { useCartStore } from "../cart"

describe("cart store", () => {
  beforeEach(() => useCartStore.getState().clearCart())

  it("adds item to cart", () => {
    useCartStore.getState().addItem({ productId: "p1", variantId: "v1", name: "Test", price: 100, quantity: 1, imageUrl: "/img.jpg" })
    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it("increments quantity when same variant added", () => {
    useCartStore.getState().addItem({ productId: "p1", variantId: "v1", name: "Test", price: 100, quantity: 1, imageUrl: "/img.jpg" })
    useCartStore.getState().addItem({ productId: "p1", variantId: "v1", name: "Test", price: 100, quantity: 2, imageUrl: "/img.jpg" })
    expect(useCartStore.getState().items[0].quantity).toBe(3)
  })

  it("removes item from cart", () => {
    useCartStore.getState().addItem({ productId: "p1", variantId: "v1", name: "Test", price: 100, quantity: 1, imageUrl: "/img.jpg" })
    useCartStore.getState().removeItem("v1")
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it("calculates total correctly", () => {
    useCartStore.getState().addItem({ productId: "p1", variantId: "v1", name: "A", price: 200, quantity: 2, imageUrl: "/img.jpg" })
    useCartStore.getState().addItem({ productId: "p2", variantId: "v2", name: "B", price: 300, quantity: 1, imageUrl: "/img.jpg" })
    expect(useCartStore.getState().total).toBe(700)
  })

  it("clears cart", () => {
    useCartStore.getState().addItem({ productId: "p1", variantId: "v1", name: "Test", price: 100, quantity: 1, imageUrl: "/img.jpg" })
    useCartStore.getState().clearCart()
    expect(useCartStore.getState().items).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Install Zustand**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npm install zustand
```

- [ ] **Step 3: Write cart store**

`apps/web/src/lib/stores/cart.ts`:
```typescript
import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface CartItem {
  productId: string
  variantId: string
  name: string
  price: number        // TWD, integer cents
  quantity: number
  imageUrl: string
}

interface CartState {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
  clearCart: () => void
  total: number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      get total() {
        return get().items.reduce((sum, i) => sum + i.price * i.quantity, 0)
      },
      addItem(item) {
        set((state) => {
          const existing = state.items.find((i) => i.variantId === item.variantId)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.variantId === item.variantId
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            }
          }
          return { items: [...state.items, item] }
        })
      },
      removeItem(variantId) {
        set((state) => ({ items: state.items.filter((i) => i.variantId !== variantId) }))
      },
      updateQuantity(variantId, quantity) {
        if (quantity <= 0) {
          get().removeItem(variantId)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.variantId === variantId ? { ...i, quantity } : i
          ),
        }))
      },
      clearCart() {
        set({ items: [] })
      },
    }),
    { name: "realreal-cart", skipHydration: true }
  )
)

// Call on app mount to rehydrate from localStorage
export function hydrateCart() {
  useCartStore.persist.rehydrate()
}
```

- [ ] **Step 4: Write CartItem component**

`apps/web/src/components/cart/CartItem.tsx`:
```typescript
"use client"
import Image from "next/image"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCartStore, CartItem as CartItemType } from "@/lib/stores/cart"

export function CartItem({ item }: { item: CartItemType }) {
  const { removeItem, updateQuantity } = useCartStore()
  return (
    <div className="flex items-center gap-3 py-3">
      <Image src={item.imageUrl} alt={item.name} width={64} height={64} className="rounded" />
      <div className="flex-1">
        <p className="text-sm font-medium">{item.name}</p>
        <p className="text-sm text-muted-foreground">NT$ {item.price.toLocaleString()}</p>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>−</Button>
          <span className="text-sm w-4 text-center">{item.quantity}</span>
          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</Button>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => removeItem(item.variantId)}><Trash2 className="h-4 w-4" /></Button>
    </div>
  )
}
```

- [ ] **Step 5: Write CartSummary component**

`apps/web/src/components/cart/CartSummary.tsx`:
```typescript
"use client"
import { useCartStore } from "@/lib/stores/cart"

export function CartSummary() {
  const { items, total } = useCartStore()
  const itemCount = items.reduce((n, i) => n + i.quantity, 0)
  return (
    <div className="border-t pt-4 space-y-1">
      <div className="flex justify-between text-sm">
        <span>商品數量</span><span>{itemCount} 件</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>小計</span><span>NT$ {total.toLocaleString()}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Write CartDrawer component**

`apps/web/src/components/cart/CartDrawer.tsx`:
```typescript
"use client"
import Link from "next/link"
import { ShoppingCart } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { useCartStore } from "@/lib/stores/cart"
import { CartItem } from "./CartItem"
import { CartSummary } from "./CartSummary"

export function CartDrawer() {
  const { items } = useCartStore()
  const itemCount = items.reduce((n, i) => n + i.quantity, 0)
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full text-xs h-5 w-5 flex items-center justify-center">
              {itemCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>購物車</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto divide-y">
          {items.length === 0
            ? <p className="text-sm text-muted-foreground py-8 text-center">購物車是空的</p>
            : items.map((item) => <CartItem key={item.variantId} item={item} />)
          }
        </div>
        {items.length > 0 && (
          <div className="pt-4">
            <CartSummary />
            <Button asChild className="w-full mt-4">
              <Link href="/checkout">前往結帳</Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 7: Run tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npx vitest run src/lib/stores/__tests__/cart.test.ts
```
Expected: 5 tests PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/stores apps/web/src/components/cart
git commit -m "feat(web): Zustand cart store with localStorage persistence"
```

### DoD
- [ ] Cart persists across page reloads (localStorage)
- [ ] Adding same variant increments quantity, does not duplicate
- [ ] `total` computed correctly
- [ ] Guest users can use the cart without logging in
- [ ] All 5 unit tests PASS

---

## Task 2: Checkout Flow Pages

**Goal:** Implement the three-step checkout UI — address/shipping, payment method selection, and order summary confirmation.

**Files:**
- Create: `apps/web/src/app/checkout/page.tsx`
- Create: `apps/web/src/app/checkout/payment/page.tsx`
- Create: `apps/web/src/app/checkout/confirm/page.tsx`
- Create: `apps/web/src/components/checkout/AddressForm.tsx`
- Create: `apps/web/src/components/checkout/ShippingSelector.tsx`
- Create: `apps/web/src/components/checkout/PaymentMethodSelector.tsx`
- Create: `apps/web/src/components/checkout/OrderSummary.tsx`
- Create: `apps/web/src/components/checkout/CvsStoreMap.tsx`
- Create: `apps/web/src/lib/stores/checkout.ts`

- [ ] **Step 1: Install shadcn/ui components needed**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx shadcn@latest add radio-group separator badge
```

- [ ] **Step 2: Write checkout Zustand store**

`apps/web/src/lib/stores/checkout.ts`:
```typescript
import { create } from "zustand"

export type ShippingMethod = "home_delivery" | "cvs_711" | "cvs_family"
export type PaymentMethod = "pchomepay" | "linepay" | "jkopay"

export interface CheckoutAddress {
  recipientName: string
  phone: string
  email: string
  zipCode: string
  city: string
  district: string
  address: string
}

export interface CvsStore {
  storeId: string
  storeName: string
  storeAddress: string
}

interface CheckoutState {
  address: CheckoutAddress | null
  shippingMethod: ShippingMethod | null
  cvsStore: CvsStore | null
  paymentMethod: PaymentMethod | null
  setAddress: (address: CheckoutAddress) => void
  setShippingMethod: (method: ShippingMethod) => void
  setCvsStore: (store: CvsStore) => void
  setPaymentMethod: (method: PaymentMethod) => void
  reset: () => void
}

export const useCheckoutStore = create<CheckoutState>()((set) => ({
  address: null,
  shippingMethod: null,
  cvsStore: null,
  paymentMethod: null,
  setAddress: (address) => set({ address }),
  setShippingMethod: (shippingMethod) => set({ shippingMethod }),
  setCvsStore: (cvsStore) => set({ cvsStore }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  reset: () => set({ address: null, shippingMethod: null, cvsStore: null, paymentMethod: null }),
}))
```

- [ ] **Step 3: Write AddressForm component**

`apps/web/src/components/checkout/AddressForm.tsx`:
```typescript
"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useCheckoutStore, CheckoutAddress } from "@/lib/stores/checkout"

const schema = z.object({
  recipientName: z.string().min(2, "請填寫收件人姓名"),
  phone: z.string().regex(/^09\d{8}$/, "請填寫有效手機號碼"),
  email: z.string().email("請填寫有效 Email"),
  zipCode: z.string().length(3, "請填寫3碼郵遞區號"),
  city: z.string().min(1, "請選擇縣市"),
  district: z.string().min(1, "請填寫鄉鎮市區"),
  address: z.string().min(5, "請填寫詳細地址"),
})

export function AddressForm({ onNext }: { onNext: () => void }) {
  const { address, setAddress } = useCheckoutStore()
  const form = useForm<CheckoutAddress>({ resolver: zodResolver(schema), defaultValues: address ?? {} })

  function onSubmit(data: CheckoutAddress) {
    setAddress(data)
    onNext()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="recipientName" render={({ field }) => (
            <FormItem><FormLabel>收件人姓名</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem><FormLabel>手機號碼</FormLabel><FormControl><Input {...field} placeholder="09xxxxxxxx" /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-3 gap-4">
          <FormField control={form.control} name="zipCode" render={({ field }) => (
            <FormItem><FormLabel>郵遞區號</FormLabel><FormControl><Input {...field} maxLength={3} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="city" render={({ field }) => (
            <FormItem><FormLabel>縣市</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="district" render={({ field }) => (
            <FormItem><FormLabel>鄉鎮市區</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <FormField control={form.control} name="address" render={({ field }) => (
          <FormItem><FormLabel>詳細地址</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <Button type="submit" className="w-full">下一步：選擇配送方式</Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 4: Write ShippingSelector + CvsStoreMap**

`apps/web/src/components/checkout/ShippingSelector.tsx`:
```typescript
"use client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useCheckoutStore, ShippingMethod } from "@/lib/stores/checkout"
import { CvsStoreMap } from "./CvsStoreMap"

const SHIPPING_OPTIONS: { value: ShippingMethod; label: string; fee: number }[] = [
  { value: "home_delivery", label: "宅配到府", fee: 100 },
  { value: "cvs_711", label: "7-ELEVEN 超取", fee: 60 },
  { value: "cvs_family", label: "全家超取", fee: 60 },
]

export function ShippingSelector({ onNext }: { onNext: () => void }) {
  const { shippingMethod, setShippingMethod, cvsStore } = useCheckoutStore()
  const isCvs = shippingMethod === "cvs_711" || shippingMethod === "cvs_family"
  const canProceed = shippingMethod && (!isCvs || cvsStore)

  return (
    <div className="space-y-6">
      <RadioGroup value={shippingMethod ?? ""} onValueChange={(v) => setShippingMethod(v as ShippingMethod)}>
        {SHIPPING_OPTIONS.map((opt) => (
          <div key={opt.value} className="flex items-center space-x-2 border rounded p-3">
            <RadioGroupItem value={opt.value} id={opt.value} />
            <Label htmlFor={opt.value} className="flex-1 cursor-pointer">
              {opt.label}
              <span className="ml-2 text-muted-foreground text-sm">NT$ {opt.fee}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      {isCvs && <CvsStoreMap type={shippingMethod as "cvs_711" | "cvs_family"} />}
      <Button className="w-full" disabled={!canProceed} onClick={onNext}>下一步：選擇付款方式</Button>
    </div>
  )
}
```

`apps/web/src/components/checkout/CvsStoreMap.tsx`:
```typescript
"use client"
// ECPay CVS store map — opens in a popup; result is posted back via BroadcastChannel
import { Button } from "@/components/ui/button"
import { useCheckoutStore } from "@/lib/stores/checkout"
import { useEffect } from "react"

const CVS_MAP_URLS: Record<"cvs_711" | "cvs_family", string> = {
  cvs_711: "https://logistics.ecpay.com.tw/Express/map?MerchantID={ECPAY_MERCHANT_ID}&LogisticsType=CVS&LogisticsSubType=UNIMART&IsCollection=N",
  cvs_family: "https://logistics.ecpay.com.tw/Express/map?MerchantID={ECPAY_MERCHANT_ID}&LogisticsType=CVS&LogisticsSubType=FAMI&IsCollection=N",
}

export function CvsStoreMap({ type }: { type: "cvs_711" | "cvs_family" }) {
  const { cvsStore, setCvsStore } = useCheckoutStore()

  useEffect(() => {
    const bc = new BroadcastChannel("ecpay_cvs")
    bc.onmessage = (e) => {
      setCvsStore({ storeId: e.data.CVSStoreID, storeName: e.data.CVSStoreName, storeAddress: e.data.CVSAddress })
    }
    return () => bc.close()
  }, [setCvsStore])

  function openMap() {
    // Replace placeholder at runtime with env var injected server-side
    const url = CVS_MAP_URLS[type].replace("{ECPAY_MERCHANT_ID}", process.env.NEXT_PUBLIC_ECPAY_MERCHANT_ID ?? "")
    window.open(url, "cvsmap", "width=900,height=680")
  }

  return (
    <div className="rounded border p-3 space-y-2">
      <Button type="button" variant="outline" onClick={openMap}>選擇門市</Button>
      {cvsStore && (
        <p className="text-sm text-muted-foreground">{cvsStore.storeName}（{cvsStore.storeAddress}）</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write PaymentMethodSelector**

`apps/web/src/components/checkout/PaymentMethodSelector.tsx`:
```typescript
"use client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useCheckoutStore, PaymentMethod } from "@/lib/stores/checkout"

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; note?: string }[] = [
  { value: "pchomepay", label: "PChomePay 支付連", note: "支援信用卡定期扣款" },
  { value: "linepay", label: "LINE Pay", note: "不支援定期扣款" },
  { value: "jkopay", label: "街口支付 JKOPay", note: "不支援定期扣款" },
]

export function PaymentMethodSelector({ onNext }: { onNext: () => void }) {
  const { paymentMethod, setPaymentMethod } = useCheckoutStore()
  return (
    <div className="space-y-6">
      <RadioGroup value={paymentMethod ?? ""} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
        {PAYMENT_OPTIONS.map((opt) => (
          <div key={opt.value} className="flex items-center space-x-2 border rounded p-3">
            <RadioGroupItem value={opt.value} id={opt.value} />
            <Label htmlFor={opt.value} className="flex-1 cursor-pointer">
              {opt.label}
              {opt.note && <span className="ml-2 text-xs text-muted-foreground">（{opt.note}）</span>}
            </Label>
          </div>
        ))}
      </RadioGroup>
      <Button className="w-full" disabled={!paymentMethod} onClick={onNext}>下一步：確認訂單</Button>
    </div>
  )
}
```

- [ ] **Step 6: Write OrderSummary component**

`apps/web/src/components/checkout/OrderSummary.tsx`:
```typescript
"use client"
import Image from "next/image"
import { Separator } from "@/components/ui/separator"
import { useCartStore } from "@/lib/stores/cart"
import { useCheckoutStore } from "@/lib/stores/checkout"

const SHIPPING_FEE: Record<string, number> = { home_delivery: 100, cvs_711: 60, cvs_family: 60 }
const PAYMENT_LABELS: Record<string, string> = { pchomepay: "PChomePay", linepay: "LINE Pay", jkopay: "街口支付" }

export function OrderSummary() {
  const { items, total } = useCartStore()
  const { address, shippingMethod, cvsStore, paymentMethod } = useCheckoutStore()
  const shippingFee = SHIPPING_FEE[shippingMethod ?? ""] ?? 0
  const grandTotal = total + shippingFee

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.variantId} className="flex items-center gap-3">
            <Image src={item.imageUrl} alt={item.name} width={48} height={48} className="rounded" />
            <div className="flex-1 text-sm">
              <p>{item.name}</p>
              <p className="text-muted-foreground">× {item.quantity}</p>
            </div>
            <p className="text-sm">NT$ {(item.price * item.quantity).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <Separator />
      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span>商品小計</span><span>NT$ {total.toLocaleString()}</span></div>
        <div className="flex justify-between"><span>運費</span><span>NT$ {shippingFee}</span></div>
        <Separator />
        <div className="flex justify-between font-semibold text-base"><span>總計</span><span>NT$ {grandTotal.toLocaleString()}</span></div>
      </div>
      <Separator />
      <div className="text-sm space-y-1">
        <p className="font-medium">收件資訊</p>
        {address && <p className="text-muted-foreground">{address.recipientName} {address.phone}</p>}
        {shippingMethod === "home_delivery" && address && (
          <p className="text-muted-foreground">{address.zipCode} {address.city}{address.district}{address.address}</p>
        )}
        {(shippingMethod === "cvs_711" || shippingMethod === "cvs_family") && cvsStore && (
          <p className="text-muted-foreground">{cvsStore.storeName}（{cvsStore.storeAddress}）</p>
        )}
        <p className="text-muted-foreground">付款方式：{PAYMENT_LABELS[paymentMethod ?? ""] ?? paymentMethod}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Write checkout pages**

`apps/web/src/app/checkout/page.tsx`:
```typescript
"use client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AddressForm } from "@/components/checkout/AddressForm"
import { ShippingSelector } from "@/components/checkout/ShippingSelector"
import { useCheckoutStore } from "@/lib/stores/checkout"
import { useState } from "react"

export default function CheckoutPage() {
  const router = useRouter()
  const [step, setStep] = useState<"address" | "shipping">("address")
  const { address } = useCheckoutStore()

  return (
    <main className="max-w-lg mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-6">結帳</h1>
      <div className="flex gap-2 mb-6 text-sm">
        <span className={step === "address" ? "font-semibold" : "text-muted-foreground"}>1. 收件資訊</span>
        <span className="text-muted-foreground">›</span>
        <span className={step === "shipping" ? "font-semibold" : "text-muted-foreground"}>2. 配送方式</span>
        <span className="text-muted-foreground">›</span>
        <span className="text-muted-foreground">3. 付款</span>
        <span className="text-muted-foreground">›</span>
        <span className="text-muted-foreground">4. 確認</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{step === "address" ? "收件資訊" : "配送方式"}</CardTitle>
        </CardHeader>
        <CardContent>
          {step === "address"
            ? <AddressForm onNext={() => setStep("shipping")} />
            : <ShippingSelector onNext={() => router.push("/checkout/payment")} />
          }
        </CardContent>
      </Card>
    </main>
  )
}
```

`apps/web/src/app/checkout/payment/page.tsx`:
```typescript
"use client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PaymentMethodSelector } from "@/components/checkout/PaymentMethodSelector"

export default function CheckoutPaymentPage() {
  const router = useRouter()
  return (
    <main className="max-w-lg mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-6">結帳</h1>
      <Card>
        <CardHeader><CardTitle>付款方式</CardTitle></CardHeader>
        <CardContent>
          <PaymentMethodSelector onNext={() => router.push("/checkout/confirm")} />
        </CardContent>
      </Card>
    </main>
  )
}
```

`apps/web/src/app/checkout/confirm/page.tsx`:
```typescript
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { OrderSummary } from "@/components/checkout/OrderSummary"
import { useCartStore } from "@/lib/stores/cart"
import { useCheckoutStore } from "@/lib/stores/checkout"
import { apiClient } from "@/lib/api-client"
import { toast } from "sonner"

export default function CheckoutConfirmPage() {
  const router = useRouter()
  const { items, clearCart } = useCartStore()
  const { address, shippingMethod, cvsStore, paymentMethod, reset } = useCheckoutStore()
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!address || !shippingMethod || !paymentMethod) return
    setLoading(true)
    try {
      const { orderId } = await apiClient<{ orderId: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({ items, address, shippingMethod, cvsStore, paymentMethod }),
      })
      clearCart()
      reset()
      // Redirect to payment gateway initiation endpoint
      router.push(`/api/payments/${paymentMethod}/initiate?orderId=${orderId}`)
    } catch (err) {
      toast.error("訂單建立失敗，請稍後再試")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-lg mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-6">確認訂單</h1>
      <Card>
        <CardHeader><CardTitle>訂單明細</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <OrderSummary />
          <Button className="w-full" disabled={loading || items.length === 0} onClick={handleSubmit}>
            {loading ? "處理中…" : "確認付款"}
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/checkout apps/web/src/components/checkout apps/web/src/lib/stores/checkout.ts
git commit -m "feat(web): multi-step checkout flow pages and components"
```

### DoD
- [ ] `/checkout` renders address form; validation errors display in Chinese
- [ ] Shipping selector shows CVS store picker for 7-11 / FamilyMart options
- [ ] `/checkout/payment` renders three payment options with notes on recurring support
- [ ] `/checkout/confirm` shows full order summary before submission
- [ ] Empty cart state redirects or shows warning on `/checkout`
- [ ] `tsc --noEmit` zero errors in `apps/web`

---

## Task 3: Order Creation API

**Goal:** Implement `POST /api/orders` in the Express API — validates cart items, reserves stock, and atomically creates `orders`, `order_items`, and `order_addresses` records in a single DB transaction.

**Files:**
- Create: `apps/api/src/routes/orders.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `packages/db/src/schema/orders.ts`
- Create: `apps/api/src/routes/__tests__/orders.test.ts`

- [ ] **Step 1: Extend Drizzle schema for orders**

`packages/db/src/schema/orders.ts`:
```typescript
import { pgTable, uuid, text, integer, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core"

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment", "payment_failed", "paid", "processing",
  "shipped", "delivered", "cancelled", "refunded",
])

export const shippingMethodEnum = pgEnum("shipping_method", [
  "home_delivery", "cvs_711", "cvs_family",
])

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),               // null for guest orders
  guestEmail: text("guest_email"),
  status: orderStatusEnum("status").notNull().default("pending_payment"),
  shippingMethod: shippingMethodEnum("shipping_method").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingFeeCents: integer("shipping_fee_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  paymentMethod: text("payment_method").notNull(),
  cvsStoreId: text("cvs_store_id"),
  cvsStoreName: text("cvs_store_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  productId: uuid("product_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  quantity: integer("quantity").notNull(),
  imageUrl: text("image_url"),
})

export const orderAddresses = pgTable("order_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  recipientName: text("recipient_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  zipCode: text("zip_code").notNull(),
  city: text("city").notNull(),
  district: text("district").notNull(),
  address: text("address").notNull(),
})
```

- [ ] **Step 2: Add webhook_events and payment_transactions tables**

`packages/db/src/schema/payments.ts`:
```typescript
import { pgTable, uuid, text, integer, timestamp, pgEnum, unique } from "drizzle-orm/pg-core"
import { orders } from "./orders"

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending", "authorised", "captured", "failed", "refunded",
])

export const paymentTransactions = pgTable("payment_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  gateway: text("gateway").notNull(),          // "pchomepay" | "linepay" | "jkopay"
  merchantTradeNo: text("merchant_trade_no").notNull(),
  gatewayTradeNo: text("gateway_trade_no"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  amountCents: integer("amount_cents").notNull(),
  rawResponse: text("raw_response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  gateway: text("gateway").notNull(),
  merchantTradeNo: text("merchant_trade_no").notNull(),
  payload: text("payload").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
}, (t) => ({
  uniqGatewayTrade: unique().on(t.gateway, t.merchantTradeNo),
}))
```

- [ ] **Step 3: Write order creation route**

`apps/api/src/routes/orders.ts`:
```typescript
import { Router } from "express"
import { z } from "zod"
import { db } from "@realreal/db"
import { orders, orderItems, orderAddresses } from "@realreal/db/schema/orders"
import { requireAuth } from "../middleware/auth"

const router = Router()

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  name: z.string(),
  price: z.number().int().positive(),
  quantity: z.number().int().positive(),
  imageUrl: z.string(),
})

const createOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  address: z.object({
    recipientName: z.string().min(2),
    phone: z.string().regex(/^09\d{8}$/),
    email: z.string().email(),
    zipCode: z.string().length(3),
    city: z.string().min(1),
    district: z.string().min(1),
    address: z.string().min(5),
  }),
  shippingMethod: z.enum(["home_delivery", "cvs_711", "cvs_family"]),
  cvsStore: z.object({
    storeId: z.string(),
    storeName: z.string(),
    storeAddress: z.string(),
  }).nullable(),
  paymentMethod: z.enum(["pchomepay", "linepay", "jkopay"]),
})

const SHIPPING_FEES: Record<string, number> = { home_delivery: 100, cvs_711: 60, cvs_family: 60 }

// POST /api/orders — auth optional (guest checkout supported)
router.post("/", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() })
  }

  const { items, address, shippingMethod, cvsStore, paymentMethod } = parsed.data
  const userId: string | undefined = (req as any).user?.sub
  const subtotalCents = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const shippingFeeCents = SHIPPING_FEES[shippingMethod] ?? 100
  const totalCents = subtotalCents + shippingFeeCents

  try {
    const orderId = await db.transaction(async (tx) => {
      // TODO: validate stock for each variantId against products table (Plan 2 dependency)
      // const stockChecks = await Promise.all(items.map(item => tx.select()...))

      const [order] = await tx.insert(orders).values({
        userId: userId ?? null,
        guestEmail: userId ? null : address.email,
        shippingMethod,
        subtotalCents,
        shippingFeeCents,
        totalCents,
        paymentMethod,
        cvsStoreId: cvsStore?.storeId ?? null,
        cvsStoreName: cvsStore?.storeName ?? null,
      }).returning({ id: orders.id })

      await tx.insert(orderItems).values(
        items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          priceCents: item.price,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
        }))
      )

      await tx.insert(orderAddresses).values({
        orderId: order.id,
        recipientName: address.recipientName,
        phone: address.phone,
        email: address.email,
        zipCode: address.zipCode,
        city: address.city,
        district: address.district,
        address: address.address,
      })

      return order.id
    })

    res.status(201).json({ orderId })
  } catch (err) {
    console.error("Order creation failed:", err)
    res.status(500).json({ error: "Order creation failed" })
  }
})

export default router
```

- [ ] **Step 4: Register route in app.ts**

`apps/api/src/app.ts` — add after existing route registrations:
```typescript
import ordersRouter from "./routes/orders"
// ...
app.use("/api/orders", ordersRouter)
```

- [ ] **Step 5: Write smoke test**

`apps/api/src/routes/__tests__/orders.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import app from "../../app"

vi.mock("@realreal/db", () => ({
  db: {
    transaction: vi.fn(async (fn: any) => {
      return fn({
        insert: () => ({ values: () => ({ returning: () => [{ id: "order-uuid-123" }] }) }),
      })
    }),
  },
}))

const validBody = {
  items: [{ productId: "00000000-0000-0000-0000-000000000001", variantId: "00000000-0000-0000-0000-000000000002", name: "Test Product", price: 500, quantity: 1, imageUrl: "/test.jpg" }],
  address: { recipientName: "王小明", phone: "0912345678", email: "test@example.com", zipCode: "100", city: "台北市", district: "中正區", address: "重慶南路一段122號" },
  shippingMethod: "home_delivery",
  cvsStore: null,
  paymentMethod: "pchomepay",
}

describe("POST /api/orders", () => {
  it("returns 201 with orderId on valid request", async () => {
    const res = await request(app).post("/api/orders").send(validBody)
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty("orderId")
  })

  it("returns 400 for empty items", async () => {
    const res = await request(app).post("/api/orders").send({ ...validBody, items: [] })
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid phone", async () => {
    const res = await request(app).post("/api/orders").send({ ...validBody, address: { ...validBody.address, phone: "1234" } })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx vitest run src/routes/__tests__/orders.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 7: Generate and apply migration**

```bash
cd /Users/cataholic/Desktop/airport/realreal/packages/db
npx drizzle-kit generate --name=add_orders_payments
```
Apply via Supabase dashboard SQL editor.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/orders.ts packages/db/src/schema
git commit -m "feat(api): POST /api/orders with atomic DB transaction"
```

### DoD
- [ ] `POST /api/orders` with valid payload returns `201 { orderId }`
- [ ] `POST /api/orders` with empty items returns `400`
- [ ] `orders`, `order_items`, `order_addresses`, `payment_transactions`, `webhook_events` tables exist in Supabase
- [ ] `webhook_events` has UNIQUE constraint on `(gateway, merchant_trade_no)`
- [ ] All 3 unit tests PASS
- [ ] `tsc --noEmit` zero errors in `apps/api` and `packages/db`

---

## Task 4: PChomePay Integration

**Goal:** Implement PChomePay payment initiation, return URL handler, and webhook handler with idempotency and timing-safe HMAC verification.

**Files:**
- Create: `apps/api/src/lib/payments/pchomepay.ts`
- Create: `apps/api/src/lib/webhook-guard.ts`
- Create: `apps/api/src/routes/payments/pchomepay.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write webhook signature verification helper**

`apps/api/src/lib/webhook-guard.ts`:
```typescript
import crypto from "crypto"

/**
 * Timing-safe HMAC-SHA256 comparison — prevents timing attacks on webhook secrets.
 * Returns true only if the computed signature matches the provided signature.
 */
export function verifyHmacSha256(
  payload: string,
  secret: string,
  providedSignature: string
): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
  // timingSafeEqual requires same-length Buffers
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(providedSignature.toLowerCase(), "hex")
    )
  } catch {
    return false
  }
}

/**
 * PChomePay uses CheckMacValue computed with HashKey + HashIV, URL-encoded, then SHA256.
 * Reference: https://developer.pchomepay.com.tw/
 */
export function verifyPChomePayMac(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string
): boolean {
  const { CheckMacValue, ...rest } = params
  if (!CheckMacValue) return false

  const sorted = Object.keys(rest)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((k) => `${k}=${rest[k]}`)
    .join("&")

  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`
  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, "+")
    .replace(/%21/g, "!")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%2a/g, "*")
    .replace(/%2d/g, "-")
    .replace(/%2e/g, ".")
    .replace(/%5f/g, "_")

  const computed = crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase()

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(CheckMacValue.toUpperCase())
  )
}
```

- [ ] **Step 2: Write PChomePay SDK wrapper**

`apps/api/src/lib/payments/pchomepay.ts`:
```typescript
import crypto from "crypto"
import { encodeURIComponent as enc } from "url" // note: use native encodeURIComponent

const BASE_URL = process.env.PCHOMEPAY_SANDBOX === "true"
  ? "https://payment-stage.pchomepay.com.tw"
  : "https://payment.pchomepay.com.tw"

const MERCHANT_ID = process.env.PCHOMEPAY_MERCHANT_ID!
const HASH_KEY = process.env.PCHOMEPAY_HASH_KEY!
const HASH_IV = process.env.PCHOMEPAY_HASH_IV!

function buildMacValue(params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  const raw = `HashKey=${HASH_KEY}&${sorted}&HashIV=${HASH_IV}`
  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, "+")
    .replace(/%21/g, "!")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%2a/g, "*")
    .replace(/%2d/g, "-")
    .replace(/%2e/g, ".")
    .replace(/%5f/g, "_")
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase()
}

export interface PChomePayOrder {
  merchantTradeNo: string
  merchantTradeDate: string    // "yyyy/MM/dd HH:mm:ss"
  totalAmount: number          // TWD integer
  tradeDesc: string
  itemName: string
  returnURL: string
  orderResultURL: string
}

export function buildPaymentForm(order: PChomePayOrder): { actionUrl: string; fields: Record<string, string> } {
  const params: Record<string, string> = {
    MerchantID: MERCHANT_ID,
    MerchantTradeNo: order.merchantTradeNo,
    MerchantTradeDate: order.merchantTradeDate,
    PaymentType: "aio",
    TotalAmount: String(order.totalAmount),
    TradeDesc: order.tradeDesc,
    ItemName: order.itemName,
    ReturnURL: order.returnURL,
    OrderResultURL: order.orderResultURL,
    ChoosePayment: "Credit",
    EncryptType: "1",
  }
  params.CheckMacValue = buildMacValue(params)
  return { actionUrl: `${BASE_URL}/Cashier/AioCheckOut/V5`, fields: params }
}
```

- [ ] **Step 3: Write PChomePay routes**

`apps/api/src/routes/payments/pchomepay.ts`:
```typescript
import { Router } from "express"
import { db } from "@realreal/db"
import { orders } from "@realreal/db/schema/orders"
import { paymentTransactions, webhookEvents } from "@realreal/db/schema/payments"
import { eq } from "drizzle-orm"
import { buildPaymentForm } from "../../lib/payments/pchomepay"
import { verifyPChomePayMac } from "../../lib/webhook-guard"

const router = Router()
const HASH_KEY = process.env.PCHOMEPAY_HASH_KEY!
const HASH_IV = process.env.PCHOMEPAY_HASH_IV!
const SITE_URL = process.env.SITE_URL ?? "https://realreal.cc"

// GET /api/payments/pchomepay/initiate?orderId=xxx
// Returns an HTML form that auto-submits to PChomePay
router.get("/initiate", async (req, res) => {
  const { orderId } = req.query as { orderId: string }
  if (!orderId) return res.status(400).json({ error: "Missing orderId" })

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) return res.status(404).json({ error: "Order not found" })

  const merchantTradeNo = `RR${Date.now()}`
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const merchantTradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  await db.insert(paymentTransactions).values({
    orderId,
    gateway: "pchomepay",
    merchantTradeNo,
    amountCents: order.totalCents,
  })

  const { actionUrl, fields } = buildPaymentForm({
    merchantTradeNo,
    merchantTradeDate,
    totalAmount: Math.round(order.totalCents),
    tradeDesc: "realreal.cc 訂單",
    itemName: `Order ${orderId}`,
    returnURL: `${SITE_URL}/api/payments/pchomepay/webhook`,
    orderResultURL: `${SITE_URL}/checkout/result?gateway=pchomepay`,
  })

  const formFields = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${v}" />`).join("")
  res.send(`<!DOCTYPE html><html><body><form id="f" action="${actionUrl}" method="POST">${formFields}</form><script>document.getElementById('f').submit()</script></body></html>`)
})

// POST /api/payments/pchomepay/webhook — called by PChomePay server
router.post("/webhook", async (req, res) => {
  const params = req.body as Record<string, string>

  if (!verifyPChomePayMac(params, HASH_KEY, HASH_IV)) {
    return res.status(400).send("0|SignatureError")
  }

  const { MerchantTradeNo, TradeNo, RtnCode } = params

  // Idempotency — ignore duplicate webhooks
  try {
    await db.insert(webhookEvents).values({
      gateway: "pchomepay",
      merchantTradeNo: MerchantTradeNo,
      payload: JSON.stringify(params),
    })
  } catch (err: any) {
    if (err.code === "23505") return res.send("1|OK")  // duplicate unique key — already processed
    throw err
  }

  const [tx] = await db.select().from(paymentTransactions)
    .where(eq(paymentTransactions.merchantTradeNo, MerchantTradeNo))
    .limit(1)

  if (tx) {
    const success = RtnCode === "1"
    await db.update(paymentTransactions)
      .set({ status: success ? "captured" : "failed", gatewayTradeNo: TradeNo, rawResponse: JSON.stringify(params) })
      .where(eq(paymentTransactions.id, tx.id))

    if (success) {
      await db.update(orders).set({ status: "paid" }).where(eq(orders.id, tx.orderId))
    } else {
      await db.update(orders).set({ status: "payment_failed" }).where(eq(orders.id, tx.orderId))
    }
  }

  res.send("1|OK")
})

// GET /api/payments/pchomepay/return — browser return after payment
router.get("/return", async (req, res) => {
  const { MerchantTradeNo, RtnCode } = req.query as Record<string, string>
  const success = RtnCode === "1"
  res.redirect(`/checkout/result?gateway=pchomepay&success=${success}&trade=${MerchantTradeNo}`)
})

export default router
```

- [ ] **Step 4: Register PChomePay routes in app.ts**

```typescript
import pchomepayRouter from "./routes/payments/pchomepay"
app.use("/api/payments/pchomepay", pchomepayRouter)
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/payments/pchomepay.ts apps/api/src/lib/webhook-guard.ts apps/api/src/routes/payments/pchomepay.ts
git commit -m "feat(api): PChomePay payment initiation, return, and webhook handler"
```

### DoD
- [ ] `GET /api/payments/pchomepay/initiate?orderId=xxx` returns auto-submit HTML form to PChomePay
- [ ] PChomePay webhook verifies `CheckMacValue` using timing-safe comparison before processing
- [ ] Duplicate webhook delivery returns `1|OK` without double-processing (idempotency via `webhook_events` UNIQUE constraint)
- [ ] Successful payment sets `orders.status = 'paid'`; failed payment sets `'payment_failed'`
- [ ] `PCHOMEPAY_HASH_KEY` and `PCHOMEPAY_HASH_IV` never appear in any HTTP response

---

## Task 5: LINE Pay Integration

**Goal:** Implement LINE Pay payment initiation, confirm API, cancel handler, and webhook; recurring payments are NOT supported.

**Files:**
- Create: `apps/api/src/lib/payments/linepay.ts`
- Create: `apps/api/src/routes/payments/linepay.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write LINE Pay SDK wrapper**

`apps/api/src/lib/payments/linepay.ts`:
```typescript
import crypto from "crypto"

// LINE Pay v3 API — https://pay.line.me/developers/apis/onlineApis
const CHANNEL_ID = process.env.LINEPAY_CHANNEL_ID!
const CHANNEL_SECRET = process.env.LINEPAY_CHANNEL_SECRET!

const BASE_URL = process.env.LINEPAY_SANDBOX === "true"
  ? "https://sandbox-api-pay.line.me"
  : "https://api-pay.line.me"

function buildSignature(channelSecret: string, uri: string, body: string, nonce: string): string {
  const message = channelSecret + uri + body + nonce
  return crypto.createHmac("sha256", channelSecret).update(message).digest("base64")
}

export async function requestPayment(payload: {
  orderId: string
  amount: number
  currency: string
  orderName: string
  confirmUrl: string
  cancelUrl: string
}): Promise<{ paymentUrl: string; transactionId: string }> {
  const uri = "/v3/payments/request"
  const nonce = crypto.randomUUID()
  const body = JSON.stringify({
    amount: payload.amount,
    currency: payload.currency,
    orderId: payload.orderId,
    packages: [{ id: payload.orderId, amount: payload.amount, name: payload.orderName, products: [{ name: payload.orderName, quantity: 1, price: payload.amount }] }],
    redirectUrls: { confirmUrl: payload.confirmUrl, cancelUrl: payload.cancelUrl },
  })
  const signature = buildSignature(CHANNEL_SECRET, uri, body, nonce)
  const response = await fetch(`${BASE_URL}${uri}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LINE-ChannelId": CHANNEL_ID,
      "X-LINE-Authorization-Nonce": nonce,
      "X-LINE-Authorization": signature,
    },
    body,
  })
  const data = await response.json() as any
  if (data.returnCode !== "0000") throw new Error(`LINE Pay error: ${data.returnCode} ${data.returnMessage}`)
  return {
    paymentUrl: data.info.paymentUrl.web,
    transactionId: String(data.info.transactionId),
  }
}

export async function confirmPayment(transactionId: string, amount: number, currency: string): Promise<void> {
  const uri = `/v3/payments/${transactionId}/confirm`
  const nonce = crypto.randomUUID()
  const body = JSON.stringify({ amount, currency })
  const signature = buildSignature(CHANNEL_SECRET, uri, body, nonce)
  const response = await fetch(`${BASE_URL}${uri}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LINE-ChannelId": CHANNEL_ID,
      "X-LINE-Authorization-Nonce": nonce,
      "X-LINE-Authorization": signature,
    },
    body,
  })
  const data = await response.json() as any
  if (data.returnCode !== "0000") throw new Error(`LINE Pay confirm error: ${data.returnCode}`)
}
```

- [ ] **Step 2: Write LINE Pay routes**

`apps/api/src/routes/payments/linepay.ts`:
```typescript
import { Router } from "express"
import { db } from "@realreal/db"
import { orders } from "@realreal/db/schema/orders"
import { paymentTransactions, webhookEvents } from "@realreal/db/schema/payments"
import { eq } from "drizzle-orm"
import { requestPayment, confirmPayment } from "../../lib/payments/linepay"

const router = Router()
const SITE_URL = process.env.SITE_URL ?? "https://realreal.cc"

// GET /api/payments/linepay/initiate?orderId=xxx
router.get("/initiate", async (req, res) => {
  const { orderId } = req.query as { orderId: string }
  if (!orderId) return res.status(400).json({ error: "Missing orderId" })

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) return res.status(404).json({ error: "Order not found" })

  // NOTE: LINE Pay does NOT support recurring / token payments.
  // For subscriptions, use PChomePay only.

  try {
    const { paymentUrl, transactionId } = await requestPayment({
      orderId,
      amount: order.totalCents,
      currency: "TWD",
      orderName: `realreal.cc 訂單 ${orderId.slice(0, 8)}`,
      confirmUrl: `${SITE_URL}/api/payments/linepay/confirm`,
      cancelUrl: `${SITE_URL}/api/payments/linepay/cancel`,
    })

    await db.insert(paymentTransactions).values({
      orderId,
      gateway: "linepay",
      merchantTradeNo: orderId,
      gatewayTradeNo: transactionId,
      amountCents: order.totalCents,
    })

    res.redirect(paymentUrl)
  } catch (err) {
    console.error("LINE Pay initiation failed:", err)
    res.redirect(`/checkout/result?gateway=linepay&success=false`)
  }
})

// GET /api/payments/linepay/confirm — LINE Pay redirects browser here after payment
router.get("/confirm", async (req, res) => {
  const { transactionId, orderId } = req.query as { transactionId: string; orderId: string }

  const [tx] = await db.select().from(paymentTransactions)
    .where(eq(paymentTransactions.gatewayTradeNo, transactionId))
    .limit(1)

  if (!tx) return res.redirect(`/checkout/result?gateway=linepay&success=false`)

  // Idempotency
  try {
    await db.insert(webhookEvents).values({
      gateway: "linepay",
      merchantTradeNo: `confirm_${transactionId}`,
      payload: JSON.stringify(req.query),
    })
  } catch {
    return res.redirect(`/checkout/result?gateway=linepay&success=true&trade=${transactionId}`)
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, tx.orderId)).limit(1)

  try {
    await confirmPayment(transactionId, order!.totalCents, "TWD")
    await db.update(paymentTransactions).set({ status: "captured" }).where(eq(paymentTransactions.id, tx.id))
    await db.update(orders).set({ status: "paid" }).where(eq(orders.id, tx.orderId))
    res.redirect(`/checkout/result?gateway=linepay&success=true&trade=${transactionId}`)
  } catch (err) {
    console.error("LINE Pay confirm failed:", err)
    await db.update(paymentTransactions).set({ status: "failed" }).where(eq(paymentTransactions.id, tx.id))
    await db.update(orders).set({ status: "payment_failed" }).where(eq(orders.id, tx.orderId))
    res.redirect(`/checkout/result?gateway=linepay&success=false`)
  }
})

// GET /api/payments/linepay/cancel
router.get("/cancel", async (req, res) => {
  res.redirect("/checkout/payment?error=cancelled")
})

export default router
```

- [ ] **Step 3: Register LINE Pay routes**

```typescript
import linepayRouter from "./routes/payments/linepay"
app.use("/api/payments/linepay", linepayRouter)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/payments/linepay.ts apps/api/src/routes/payments/linepay.ts
git commit -m "feat(api): LINE Pay v3 payment initiation and confirm handler (no recurring)"
```

### DoD
- [ ] LINE Pay initiation redirects browser to LINE Pay payment URL
- [ ] Confirm endpoint calls LINE Pay confirm API and updates order status to `paid`
- [ ] Cancel endpoint redirects back to payment selection page
- [ ] Duplicate confirm requests are handled idempotently (second call skips API, returns success redirect)
- [ ] Code includes inline comment: "LINE Pay does NOT support recurring / token payments"

---

## Task 6: JKOPay (街口支付) Integration

**Goal:** Implement JKOPay payment initiation, result handler, and webhook with signature verification; recurring payments are NOT supported.

**Files:**
- Create: `apps/api/src/lib/payments/jkopay.ts`
- Create: `apps/api/src/routes/payments/jkopay.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write JKOPay SDK wrapper**

`apps/api/src/lib/payments/jkopay.ts`:
```typescript
import crypto from "crypto"

// JKOPay Online Payment API — https://developer.jkopay.com/
// NOTE: JKOPay does NOT support recurring / token payments.
const STORE_ID = process.env.JKOPAY_STORE_ID!
const API_KEY = process.env.JKOPAY_API_KEY!

const BASE_URL = process.env.JKOPAY_SANDBOX === "true"
  ? "https://uat-api.jkopay.com"
  : "https://api.jkopay.com"

function buildSignature(payload: string): string {
  return crypto.createHmac("sha256", API_KEY).update(payload).digest("hex")
}

export async function createOrder(params: {
  merchantTradeNo: string
  totalAmount: number
  orderName: string
  returnUrl: string
  notifyUrl: string
}): Promise<{ paymentUrl: string }> {
  const payload = JSON.stringify({
    storeID: STORE_ID,
    merchantTradeNo: params.merchantTradeNo,
    currency: "TWD",
    totalPrice: params.totalAmount,
    orderDesc: params.orderName,
    returnURL: params.returnUrl,
    notifyURL: params.notifyUrl,
  })
  const signature = buildSignature(payload)

  const response = await fetch(`${BASE_URL}/order/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Store-ID": STORE_ID,
      "X-Signature": signature,
    },
    body: payload,
  })
  const data = await response.json() as any
  if (!data.paymentURL) throw new Error(`JKOPay error: ${JSON.stringify(data)}`)
  return { paymentUrl: data.paymentURL }
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const computed = buildSignature(body)
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Write JKOPay routes**

`apps/api/src/routes/payments/jkopay.ts`:
```typescript
import { Router } from "express"
import { db } from "@realreal/db"
import { orders } from "@realreal/db/schema/orders"
import { paymentTransactions, webhookEvents } from "@realreal/db/schema/payments"
import { eq } from "drizzle-orm"
import { createOrder, verifyWebhookSignature } from "../../lib/payments/jkopay"

// NOTE: JKOPay does NOT support recurring / token payments.
// For subscriptions, use PChomePay only.

const router = Router()
const SITE_URL = process.env.SITE_URL ?? "https://realreal.cc"

// GET /api/payments/jkopay/initiate?orderId=xxx
router.get("/initiate", async (req, res) => {
  const { orderId } = req.query as { orderId: string }
  if (!orderId) return res.status(400).json({ error: "Missing orderId" })

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  if (!order) return res.status(404).json({ error: "Order not found" })

  const merchantTradeNo = `RRJ${Date.now()}`

  try {
    const { paymentUrl } = await createOrder({
      merchantTradeNo,
      totalAmount: order.totalCents,
      orderName: `realreal.cc 訂單 ${orderId.slice(0, 8)}`,
      returnUrl: `${SITE_URL}/api/payments/jkopay/result`,
      notifyUrl: `${SITE_URL}/api/payments/jkopay/webhook`,
    })

    await db.insert(paymentTransactions).values({
      orderId,
      gateway: "jkopay",
      merchantTradeNo,
      amountCents: order.totalCents,
    })

    res.redirect(paymentUrl)
  } catch (err) {
    console.error("JKOPay initiation failed:", err)
    res.redirect(`/checkout/result?gateway=jkopay&success=false`)
  }
})

// GET /api/payments/jkopay/result — browser return after payment
router.get("/result", async (req, res) => {
  const { merchantTradeNo, status } = req.query as { merchantTradeNo: string; status: string }
  const success = status === "SUCCESS"
  res.redirect(`/checkout/result?gateway=jkopay&success=${success}&trade=${merchantTradeNo}`)
})

// POST /api/payments/jkopay/webhook — JKOPay server notification
router.post("/webhook", async (req, res) => {
  const rawBody = JSON.stringify(req.body)
  const signature = req.headers["x-signature"] as string

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ error: "Invalid signature" })
  }

  const { merchantTradeNo, tradeNo, status } = req.body as Record<string, string>

  // Idempotency
  try {
    await db.insert(webhookEvents).values({
      gateway: "jkopay",
      merchantTradeNo,
      payload: rawBody,
    })
  } catch (err: any) {
    if (err.code === "23505") return res.json({ result: "OK" })
    throw err
  }

  const [tx] = await db.select().from(paymentTransactions)
    .where(eq(paymentTransactions.merchantTradeNo, merchantTradeNo))
    .limit(1)

  if (tx) {
    const success = status === "SUCCESS"
    await db.update(paymentTransactions)
      .set({ status: success ? "captured" : "failed", gatewayTradeNo: tradeNo, rawResponse: rawBody })
      .where(eq(paymentTransactions.id, tx.id))

    await db.update(orders)
      .set({ status: success ? "paid" : "payment_failed" })
      .where(eq(orders.id, tx.orderId))
  }

  res.json({ result: "OK" })
})

export default router
```

- [ ] **Step 3: Register JKOPay routes**

```typescript
import jkopayRouter from "./routes/payments/jkopay"
app.use("/api/payments/jkopay", jkopayRouter)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/payments/jkopay.ts apps/api/src/routes/payments/jkopay.ts
git commit -m "feat(api): JKOPay payment initiation, result, and webhook handler (no recurring)"
```

### DoD
- [ ] JKOPay initiation redirects browser to JKOPay payment URL
- [ ] Webhook rejects requests with invalid HMAC signature (returns 400)
- [ ] Webhook processes success/failure and updates order status atomically
- [ ] Duplicate webhook delivery returns OK without double-processing
- [ ] Code includes inline comment: "JKOPay does NOT support recurring / token payments"

---

## Task 7: ECPay Logistics Integration

**Goal:** Implement ECPay Logistics for 7-11/FamilyMart CVS pickup and home delivery — create logistics record and handle tracking webhooks.

**Files:**
- Create: `apps/api/src/lib/logistics/ecpay.ts`
- Create: `apps/api/src/routes/logistics/ecpay.ts`
- Create: `packages/db/src/schema/logistics.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add logistics schema**

`packages/db/src/schema/logistics.ts`:
```typescript
import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core"
import { orders } from "./orders"

export const logisticsStatusEnum = pgEnum("logistics_status", [
  "created", "in_transit", "arrived_cvs", "delivered", "failed",
])

export const logisticsRecords = pgTable("logistics_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  logisticsId: text("logistics_id"),               // ECPay AllPayLogisticsID
  logisticsSubType: text("logistics_sub_type"),    // "UNIMART" | "FAMI" | "TCAT" | "POST"
  status: logisticsStatusEnum("status").notNull().default("created"),
  trackingNumber: text("tracking_number"),
  cvsPaymentNo: text("cvs_payment_no"),            // CVS pickup code
  cvsValidationNo: text("cvs_validation_no"),
  bookingNote: text("booking_note"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
```

- [ ] **Step 2: Write ECPay Logistics SDK wrapper**

`apps/api/src/lib/logistics/ecpay.ts`:
```typescript
import crypto from "crypto"
import { URLSearchParams } from "url"

const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID!
const HASH_KEY = process.env.ECPAY_HASH_KEY!
const HASH_IV = process.env.ECPAY_HASH_IV!

const BASE_URL = process.env.ECPAY_SANDBOX === "true"
  ? "https://logistics-stage.ecpay.com.tw"
  : "https://logistics.ecpay.com.tw"

function buildMacValue(params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  const raw = `HashKey=${HASH_KEY}&${sorted}&HashIV=${HASH_IV}`
  const encoded = encodeURIComponent(raw).toLowerCase()
    .replace(/%20/g, "+").replace(/%21/g, "!").replace(/%28/g, "(")
    .replace(/%29/g, ")").replace(/%2a/g, "*").replace(/%2d/g, "-")
    .replace(/%2e/g, ".").replace(/%5f/g, "_")
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase()
}

export async function createLogistics(params: {
  merchantTradeNo: string
  senderName: string
  senderPhone: string
  senderZipCode: string
  senderAddress: string
  receiverName: string
  receiverPhone: string
  receiverZipCode?: string
  receiverAddress?: string
  receiverStoreID?: string
  logisticsSubType: "UNIMART" | "FAMI" | "TCAT" | "POST"
  goodsWeight: number
  notifyUrl: string
  serverReplyURL: string
}): Promise<{ logisticsId: string; cvsPaymentNo?: string; cvsValidationNo?: string }> {
  const isCvs = params.logisticsSubType === "UNIMART" || params.logisticsSubType === "FAMI"

  const fields: Record<string, string> = {
    MerchantID: MERCHANT_ID,
    MerchantTradeNo: params.merchantTradeNo,
    MerchantTradeDate: new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "/"),
    LogisticsType: "CVS",
    LogisticsSubType: params.logisticsSubType,
    GoodsAmount: "1",
    GoodsWeight: String(params.goodsWeight),
    GoodName: "realreal.cc 訂單",
    SenderName: params.senderName,
    SenderPhone: params.senderPhone,
    SenderZipCode: params.senderZipCode,
    SenderAddress: params.senderAddress,
    ReceiverName: params.receiverName,
    ReceiverPhone: params.receiverPhone,
    ...(isCvs
      ? { ReceiverStoreID: params.receiverStoreID ?? "", ReceiverEmail: "" }
      : { ReceiverZipCode: params.receiverZipCode ?? "", ReceiverAddress: params.receiverAddress ?? "" }
    ),
    ServerReplyURL: params.serverReplyURL,
    IsCollection: "N",
  }

  fields.CheckMacValue = buildMacValue(fields)

  const response = await fetch(`${BASE_URL}/Express/Create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  })
  const text = await response.text()
  const result = Object.fromEntries(new URLSearchParams(text))

  if (result.RtnCode !== "1") throw new Error(`ECPay Logistics error: ${result.RtnCode} ${result.RtnMsg}`)
  return {
    logisticsId: result.AllPayLogisticsID,
    cvsPaymentNo: result.CVSPaymentNo,
    cvsValidationNo: result.CVSValidationNo,
  }
}
```

- [ ] **Step 3: Write ECPay Logistics route**

`apps/api/src/routes/logistics/ecpay.ts`:
```typescript
import { Router } from "express"
import { db } from "@realreal/db"
import { orders, orderAddresses } from "@realreal/db/schema/orders"
import { logisticsRecords } from "@realreal/db/schema/logistics"
import { eq } from "drizzle-orm"
import { createLogistics } from "../../lib/logistics/ecpay"
import { verifyPChomePayMac } from "../../lib/webhook-guard"

const router = Router()

// POST /api/logistics/ecpay/create — internal, called after order is paid
router.post("/create", async (req, res) => {
  const { orderId } = req.body as { orderId: string }
  if (!orderId) return res.status(400).json({ error: "Missing orderId" })

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  const [addr] = await db.select().from(orderAddresses).where(eq(orderAddresses.orderId, orderId)).limit(1)
  if (!order || !addr) return res.status(404).json({ error: "Order not found" })

  const isCvs = order.shippingMethod === "cvs_711" || order.shippingMethod === "cvs_family"
  const subType = order.shippingMethod === "cvs_711" ? "UNIMART" : order.shippingMethod === "cvs_family" ? "FAMI" : "TCAT"
  const merchantTradeNo = `RRL${Date.now()}`

  const { logisticsId, cvsPaymentNo, cvsValidationNo } = await createLogistics({
    merchantTradeNo,
    senderName: process.env.ECPAY_SENDER_NAME ?? "誠真生活",
    senderPhone: process.env.ECPAY_SENDER_PHONE ?? "",
    senderZipCode: process.env.ECPAY_SENDER_ZIP ?? "100",
    senderAddress: process.env.ECPAY_SENDER_ADDRESS ?? "",
    receiverName: addr.recipientName,
    receiverPhone: addr.phone,
    receiverZipCode: addr.zipCode,
    receiverAddress: addr.address,
    receiverStoreID: order.cvsStoreId ?? undefined,
    logisticsSubType: subType as any,
    goodsWeight: 1,
    notifyUrl: `${process.env.SITE_URL}/api/logistics/ecpay/webhook`,
    serverReplyURL: `${process.env.SITE_URL}/api/logistics/ecpay/webhook`,
  })

  await db.insert(logisticsRecords).values({
    orderId,
    logisticsId,
    logisticsSubType: subType,
    cvsPaymentNo,
    cvsValidationNo,
  })

  res.json({ logisticsId, cvsPaymentNo, cvsValidationNo })
})

// POST /api/logistics/ecpay/webhook — ECPay status updates
router.post("/webhook", async (req, res) => {
  const params = req.body as Record<string, string>
  const { AllPayLogisticsID, LogisticsStatus, BookingNote } = params

  const [record] = await db.select().from(logisticsRecords)
    .where(eq(logisticsRecords.logisticsId, AllPayLogisticsID))
    .limit(1)

  if (record) {
    const statusMap: Record<string, string> = {
      "300": "in_transit",
      "3024": "arrived_cvs",
      "3018": "delivered",
      "3022": "failed",
    }
    const mapped = statusMap[LogisticsStatus] ?? "in_transit"
    await db.update(logisticsRecords)
      .set({ status: mapped as any, bookingNote: BookingNote })
      .where(eq(logisticsRecords.id, record.id))
  }

  res.send("1|OK")
})

export default router
```

- [ ] **Step 4: Register logistics routes**

```typescript
import ecpayLogisticsRouter from "./routes/logistics/ecpay"
app.use("/api/logistics/ecpay", ecpayLogisticsRouter)
```

- [ ] **Step 5: Apply migration**

```bash
cd /Users/cataholic/Desktop/airport/realreal/packages/db
npx drizzle-kit generate --name=add_logistics
```
Apply via Supabase dashboard SQL editor.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/logistics apps/api/src/routes/logistics packages/db/src/schema/logistics.ts
git commit -m "feat(api): ECPay Logistics CVS and home delivery integration"
```

### DoD
- [ ] `POST /api/logistics/ecpay/create` creates a logistics record and returns `logisticsId`
- [ ] CVS shipments include `CVSPaymentNo` and `CVSValidationNo` in response
- [ ] Webhook updates `logistics_records.status` on ECPay status push
- [ ] `logistics_records` table exists in Supabase with correct schema
- [ ] `tsc --noEmit` zero errors in `apps/api`

---

## Task 8: Order Status Pages

**Goal:** Implement `/my-account/orders` order list and `/my-account/orders/[id]` order detail page with a timeline showing payment, shipping, and invoice status.

**Files:**
- Create: `apps/web/src/app/my-account/orders/page.tsx`
- Create: `apps/web/src/app/my-account/orders/[id]/page.tsx`
- Create: `apps/api/src/routes/my-orders.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write orders API route**

`apps/api/src/routes/my-orders.ts`:
```typescript
import { Router } from "express"
import { db } from "@realreal/db"
import { orders, orderItems, orderAddresses } from "@realreal/db/schema/orders"
import { paymentTransactions } from "@realreal/db/schema/payments"
import { logisticsRecords } from "@realreal/db/schema/logistics"
import { eq, desc } from "drizzle-orm"
import { requireAuth } from "../middleware/auth"

const router = Router()
router.use(requireAuth)

// GET /api/my/orders — list orders for current user
router.get("/", async (req, res) => {
  const userId = (req as any).user.sub
  const list = await db.select({
    id: orders.id,
    status: orders.status,
    totalCents: orders.totalCents,
    paymentMethod: orders.paymentMethod,
    shippingMethod: orders.shippingMethod,
    createdAt: orders.createdAt,
  }).from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(50)

  res.json({ orders: list })
})

// GET /api/my/orders/:id — order detail
router.get("/:id", async (req, res) => {
  const userId = (req as any).user.sub
  const orderId = req.params.id

  const [order] = await db.select().from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order || order.userId !== userId) return res.status(404).json({ error: "Order not found" })

  const [items, address, payment, logistics] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    db.select().from(orderAddresses).where(eq(orderAddresses.orderId, orderId)).limit(1),
    db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId)).orderBy(desc(paymentTransactions.createdAt)).limit(1),
    db.select().from(logisticsRecords).where(eq(logisticsRecords.orderId, orderId)).limit(1),
  ])

  res.json({
    order,
    items,
    address: address[0] ?? null,
    payment: payment[0] ?? null,
    logistics: logistics[0] ?? null,
  })
})

export default router
```

- [ ] **Step 2: Register route in app.ts**

```typescript
import myOrdersRouter from "./routes/my-orders"
app.use("/api/my/orders", myOrdersRouter)
```

- [ ] **Step 3: Write order list page**

`apps/web/src/app/my-account/orders/page.tsx`:
```typescript
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { apiClient } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "待付款", payment_failed: "付款失敗", paid: "已付款",
  processing: "處理中", shipped: "已出貨", delivered: "已送達",
  cancelled: "已取消", refunded: "已退款",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_payment: "outline", payment_failed: "destructive", paid: "default",
  processing: "secondary", shipped: "secondary", delivered: "default",
  cancelled: "outline", refunded: "outline",
}

export default async function OrdersPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { orders } = await apiClient<{ orders: any[] }>("/my/orders")

  return (
    <main className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold mb-6">我的訂單</h1>
      {orders.length === 0
        ? <p className="text-muted-foreground">尚無訂單記錄</p>
        : (
          <div className="space-y-3">
            {orders.map((order) => (
              <Link key={order.id} href={`/my-account/orders/${order.id}`} className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-muted-foreground">#{order.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-sm mt-1">{new Date(order.createdAt).toLocaleDateString("zh-TW")}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={STATUS_VARIANT[order.status] ?? "outline"}>{STATUS_LABELS[order.status] ?? order.status}</Badge>
                    <p className="text-sm font-semibold mt-1">NT$ {order.totalCents.toLocaleString()}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )
      }
    </main>
  )
}
```

- [ ] **Step 4: Write order detail page with timeline**

`apps/web/src/app/my-account/orders/[id]/page.tsx`:
```typescript
import { redirect, notFound } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { apiClient } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { CheckCircle2, Clock, XCircle, Truck, Package } from "lucide-react"
import Image from "next/image"

function TimelineStep({ icon: Icon, label, active, done }: { icon: any; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${done ? "text-primary" : active ? "text-foreground" : "text-muted-foreground"}`}>
      <Icon className={`h-4 w-4 ${done ? "text-primary" : ""}`} />
      <span>{label}</span>
    </div>
  )
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let data: any
  try {
    data = await apiClient(`/my/orders/${params.id}`)
  } catch {
    notFound()
  }
  const { order, items, address, payment, logistics } = data

  const paymentDone = ["paid", "processing", "shipped", "delivered"].includes(order.status)
  const processingDone = ["processing", "shipped", "delivered"].includes(order.status)
  const shippedDone = ["shipped", "delivered"].includes(order.status)
  const deliveredDone = order.status === "delivered"

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">訂單 #{order.id.slice(0, 8).toUpperCase()}</h1>
        <Badge>{order.status}</Badge>
      </div>

      {/* Timeline */}
      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="font-medium text-sm">訂單進度</h2>
        <div className="space-y-2">
          <TimelineStep icon={paymentDone ? CheckCircle2 : Clock} label="付款確認" active={order.status === "pending_payment"} done={paymentDone} />
          <TimelineStep icon={processingDone ? CheckCircle2 : Package} label="備貨中" active={order.status === "processing"} done={processingDone} />
          <TimelineStep icon={shippedDone ? CheckCircle2 : Truck} label="已出貨" active={order.status === "shipped"} done={shippedDone} />
          <TimelineStep icon={deliveredDone ? CheckCircle2 : CheckCircle2} label="已送達" active={false} done={deliveredDone} />
        </div>
        {logistics?.trackingNumber && <p className="text-xs text-muted-foreground">追蹤號碼：{logistics.trackingNumber}</p>}
        {logistics?.cvsPaymentNo && <p className="text-xs text-muted-foreground">取貨編號：{logistics.cvsPaymentNo}</p>}
      </div>

      {/* Items */}
      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="font-medium text-sm">商品明細</h2>
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center gap-3">
            {item.imageUrl && <Image src={item.imageUrl} alt={item.name} width={48} height={48} className="rounded" />}
            <div className="flex-1 text-sm">
              <p>{item.name}</p>
              <p className="text-muted-foreground">× {item.quantity}</p>
            </div>
            <p className="text-sm">NT$ {(item.priceCents * item.quantity).toLocaleString()}</p>
          </div>
        ))}
        <Separator />
        <div className="flex justify-between text-sm">
          <span>運費</span><span>NT$ {order.shippingFeeCents}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>總計</span><span>NT$ {order.totalCents.toLocaleString()}</span>
        </div>
      </div>

      {/* Address */}
      {address && (
        <div className="border rounded-lg p-4 text-sm space-y-1">
          <h2 className="font-medium">收件資訊</h2>
          <p>{address.recipientName} {address.phone}</p>
          <p className="text-muted-foreground">{address.zipCode} {address.city}{address.district}{address.address}</p>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/my-account/orders apps/api/src/routes/my-orders.ts
git commit -m "feat(web/api): order list and detail pages with status timeline"
```

### DoD
- [ ] `/my-account/orders` lists all orders for the authenticated user (redirects to login if unauthenticated)
- [ ] `/my-account/orders/[id]` shows items, totals, address, and four-step timeline
- [ ] Order belonging to a different user returns 404
- [ ] CVS pickup code (`CVSPaymentNo`) is displayed on the detail page when available
- [ ] `tsc --noEmit` zero errors in `apps/web` and `apps/api`

---

## Task 9: Integration Smoke Test + DoD

**Goal:** Place a complete test order end-to-end in sandbox mode — from cart through payment to order status — verifying all integrations work together.

**Files:**
- Create: `apps/api/src/scripts/smoke-test-order.ts`

- [ ] **Step 1: Set sandbox environment variables**

In `apps/api/.env` / Railway sandbox environment, confirm all sandbox flags are set:

```bash
PCHOMEPAY_SANDBOX=true
LINEPAY_SANDBOX=true
JKOPAY_SANDBOX=true
ECPAY_SANDBOX=true
```

- [ ] **Step 2: Write smoke test script**

`apps/api/src/scripts/smoke-test-order.ts`:
```typescript
/**
 * Smoke test: creates a test order via the API, confirms all DB records exist,
 * simulates a PChomePay webhook, and verifies order status transitions.
 *
 * Usage: npx tsx src/scripts/smoke-test-order.ts
 */
import { db } from "@realreal/db"
import { orders, orderItems, orderAddresses } from "@realreal/db/schema/orders"
import { paymentTransactions, webhookEvents } from "@realreal/db/schema/payments"
import { eq } from "drizzle-orm"
import crypto from "crypto"

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:4000"

async function post(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  console.log("=== RealReal Checkout Smoke Test ===")

  // 1. Create order
  console.log("\n[1] Creating order…")
  const { orderId } = await post("/api/orders", {
    items: [{ productId: "00000000-0000-0000-0000-000000000001", variantId: "00000000-0000-0000-0000-000000000002", name: "有機薑黃膠囊 60粒", price: 980, quantity: 2, imageUrl: "/products/turmeric.jpg" }],
    address: { recipientName: "測試收件人", phone: "0912345678", email: "smoke@realreal.cc", zipCode: "100", city: "台北市", district: "中正區", address: "重慶南路一段122號" },
    shippingMethod: "home_delivery",
    cvsStore: null,
    paymentMethod: "pchomepay",
  })
  console.log(`  ✓ Order created: ${orderId}`)

  // 2. Verify DB records
  console.log("\n[2] Verifying DB records…")
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  console.assert(order, "order record missing")
  console.assert(order.status === "pending_payment", `expected pending_payment, got ${order.status}`)

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  console.assert(items.length === 1, `expected 1 item, got ${items.length}`)

  const [addr] = await db.select().from(orderAddresses).where(eq(orderAddresses.orderId, orderId)).limit(1)
  console.assert(addr, "order_addresses record missing")
  console.log("  ✓ orders, order_items, order_addresses records verified")

  // 3. Simulate PChomePay webhook (sandbox)
  console.log("\n[3] Simulating PChomePay webhook…")
  const merchantTradeNo = `SMOKE${Date.now()}`
  const tradeNo = `T${Date.now()}`

  // First, insert a payment_transactions record to simulate initiation
  await db.insert(paymentTransactions).values({
    orderId,
    gateway: "pchomepay",
    merchantTradeNo,
    amountCents: order.totalCents,
  })

  const webhookParams: Record<string, string> = {
    MerchantID: process.env.PCHOMEPAY_MERCHANT_ID ?? "TEST",
    MerchantTradeNo: merchantTradeNo,
    TradeNo: tradeNo,
    RtnCode: "1",
    RtnMsg: "交易成功",
    TradeAmt: String(order.totalCents),
    PaymentDate: new Date().toISOString(),
    PaymentType: "Credit_CreditCard",
    EncryptType: "1",
  }

  // Build CheckMacValue
  const sorted = Object.keys(webhookParams)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((k) => `${k}=${webhookParams[k]}`)
    .join("&")
  const raw = `HashKey=${process.env.PCHOMEPAY_HASH_KEY}&${sorted}&HashIV=${process.env.PCHOMEPAY_HASH_IV}`
  const encoded = encodeURIComponent(raw).toLowerCase()
    .replace(/%20/g, "+").replace(/%21/g, "!").replace(/%28/g, "(")
    .replace(/%29/g, ")").replace(/%2a/g, "*").replace(/%2d/g, "-")
    .replace(/%2e/g, ".").replace(/%5f/g, "_")
  webhookParams.CheckMacValue = crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase()

  const webhookRes = await fetch(`${API_BASE}/api/payments/pchomepay/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(webhookParams).toString(),
  })
  const webhookBody = await webhookRes.text()
  console.assert(webhookBody === "1|OK", `Expected 1|OK, got: ${webhookBody}`)
  console.log("  ✓ Webhook responded 1|OK")

  // 4. Verify order status updated to paid
  console.log("\n[4] Verifying order status transition…")
  const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  console.assert(updatedOrder.status === "paid", `expected paid, got ${updatedOrder.status}`)
  console.log("  ✓ Order status: paid")

  // 5. Verify idempotency (send webhook again — expect 1|OK without error)
  console.log("\n[5] Testing webhook idempotency…")
  const dupeRes = await fetch(`${API_BASE}/api/payments/pchomepay/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(webhookParams).toString(),
  })
  const dupeBody = await dupeRes.text()
  console.assert(dupeBody === "1|OK", `Expected 1|OK on duplicate, got: ${dupeBody}`)
  console.log("  ✓ Duplicate webhook handled idempotently")

  console.log("\n=== Smoke Test PASSED ===")
}

main().catch((err) => { console.error("Smoke test FAILED:", err); process.exit(1) })
```

- [ ] **Step 3: Run smoke test**

```bash
cd /Users/cataholic/Desktop/airport/realreal
API_BASE_URL=http://localhost:4000 npx tsx apps/api/src/scripts/smoke-test-order.ts
```
Expected: `=== Smoke Test PASSED ===`

- [ ] **Step 4: TypeScript check all packages**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/packages/db && npx tsc --noEmit
```
Expected: No errors in any package

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/smoke-test-order.ts
git commit -m "test(api): end-to-end checkout smoke test with PChomePay sandbox"
```

### DoD
- [ ] Smoke test creates an order, simulates a PChomePay webhook, and verifies order transitions to `paid`
- [ ] Duplicate webhook test confirms idempotency (second call returns `1|OK` without error)
- [ ] `tsc --noEmit` zero errors in all three packages (`web`, `api`, `db`)
- [ ] All Vitest unit tests from Tasks 1 and 3 still PASS after integration
- [ ] No sandbox API keys / secrets appear in committed code (all via env vars)

---

## Definition of Done

- [ ] Cart persists to localStorage and syncs correctly across page reloads
- [ ] Full checkout flow navigable: `/checkout` → `/checkout/payment` → `/checkout/confirm`
- [ ] `POST /api/orders` creates `orders` + `order_items` + `order_addresses` atomically
- [ ] PChomePay: payment initiates, webhook verifies signature (timing-safe), updates order to `paid`
- [ ] LINE Pay: initiates via v3 API, confirm endpoint captures payment (note: no recurring support)
- [ ] JKOPay: initiates, webhook verifies HMAC (note: no recurring support)
- [ ] ECPay Logistics: creates CVS or home-delivery record with correct sub-type
- [ ] `/my-account/orders` and `/my-account/orders/[id]` render correctly for authenticated users
- [ ] All webhook handlers are idempotent (`webhook_events` UNIQUE guard prevents double-processing)
- [ ] Smoke test passes end-to-end with sandbox credentials
- [ ] `npx turbo test` — all tests PASS
- [ ] `tsc --noEmit` — zero errors in all 3 packages (`web`, `api`, `db`)
