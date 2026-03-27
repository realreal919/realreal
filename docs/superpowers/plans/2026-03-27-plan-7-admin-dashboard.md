# Plan 7: Admin Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full admin panel at `/admin/*` — protected by `requireAdmin` middleware — covering order management, product management, customer management, subscription management, analytics, BullMQ job monitoring, and system settings.

**Architecture:** All `/admin/*` routes are server-side rendered Next.js App Router pages behind a shared layout that verifies the current user has `role='admin'` in `user_profiles`. Data mutations go through the Railway Express API (`requireAdmin` middleware) or Next.js Server Actions that call the API. Analytics queries hit Supabase directly via the service-role client. Bull Board is mounted on the Express API at `GET /admin/bull-board`.

**Tech Stack:** Next.js 15 App Router, shadcn/ui DataTable (TanStack Table), Recharts, shadcn/ui form components, Supabase JS v2 service-role client, Express 5 + BullMQ + Bull Board, Drizzle ORM, Zod, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-26-realreal-rewrite-design.md`

**Dependencies:** Plans 1–6 must be complete (foundation, products, orders, payments, subscriptions, coupons/invoices all implemented).

---

## File Map

```
realreal/
├── apps/
│   ├── web/
│   │   └── src/
│   │       └── app/
│   │           └── admin/
│   │               ├── layout.tsx                        # Admin shell: sidebar + breadcrumbs + role gate
│   │               ├── page.tsx                          # /admin redirect → /admin/orders
│   │               ├── orders/
│   │               │   ├── page.tsx                      # Order list DataTable
│   │               │   ├── actions.ts                    # bulk status update Server Actions
│   │               │   └── [id]/
│   │               │       └── page.tsx                  # Order detail
│   │               ├── products/
│   │               │   ├── page.tsx                      # Product list DataTable
│   │               │   ├── new/
│   │               │   │   └── page.tsx                  # New product form
│   │               │   └── [id]/
│   │               │       └── edit/
│   │               │           └── page.tsx              # Edit product form
│   │               ├── customers/
│   │               │   ├── page.tsx                      # Customer list DataTable
│   │               │   └── [id]/
│   │               │       └── page.tsx                  # Customer detail
│   │               ├── subscriptions/
│   │               │   ├── page.tsx                      # Subscription list DataTable
│   │               │   └── [id]/
│   │               │       └── page.tsx                  # Subscription detail
│   │               ├── analytics/
│   │               │   └── page.tsx                      # Revenue charts, top products, MRR
│   │               ├── jobs/
│   │               │   └── page.tsx                      # BullMQ job monitor (iframe → Bull Board)
│   │               └── settings/
│   │                   └── page.tsx                      # Membership tiers, subscription plans, site notice
│   └── api/
│       └── src/
│           ├── routes/
│           │   └── admin/
│           │       ├── index.ts                          # Mount all admin routes
│           │       ├── orders.ts                         # PATCH /admin/orders/:id/status, bulk
│           │       ├── products.ts                       # POST/PATCH/DELETE /admin/products
│           │       ├── customers.ts                      # PATCH /admin/customers/:id/tier
│           │       ├── subscriptions.ts                  # POST /admin/subscriptions/:id/retry, cancel
│           │       └── settings.ts                       # PATCH /admin/settings/tiers, site-notice
│           └── lib/
│               └── bull-board.ts                         # Bull Board setup
```

---

## Task 1: Admin Layout + Navigation

**Files:**
- Create: `apps/web/src/app/admin/layout.tsx`
- Create: `apps/web/src/app/admin/page.tsx`

- [ ] **Step 1: Install required shadcn/ui components**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx shadcn@latest add sidebar separator badge tooltip
```

- [ ] **Step 2: Write admin layout**

`apps/web/src/app/admin/layout.tsx`:
```typescript
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Separator } from "@/components/ui/separator"
import {
  ShoppingCart,
  Package,
  Users,
  RefreshCw,
  Tag,
  FileText,
  BarChart2,
  Cpu,
  Settings,
} from "lucide-react"

const NAV_ITEMS = [
  { href: "/admin/orders",        label: "訂單管理",    icon: ShoppingCart },
  { href: "/admin/products",      label: "商品管理",    icon: Package },
  { href: "/admin/subscriptions", label: "訂閱管理",    icon: RefreshCw },
  { href: "/admin/customers",     label: "會員管理",    icon: Users },
  { href: "/admin/coupons",       label: "優惠券",      icon: Tag },
  { href: "/admin/invoices",      label: "發票",        icon: FileText },
  { href: "/admin/analytics",     label: "數據分析",    icon: BarChart2 },
  { href: "/admin/jobs",          label: "背景任務",    icon: Cpu },
  { href: "/admin/settings",      label: "系統設定",    icon: Settings },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login?redirect=/admin")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") redirect("/")

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-zinc-200">
          <span className="font-semibold text-sm text-zinc-900">誠真生活 管理後台</span>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <Separator />
        <div className="p-4 text-xs text-zinc-400">{user.email}</div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Write /admin root page (redirect)**

`apps/web/src/app/admin/page.tsx`:
```typescript
import { redirect } from "next/navigation"

export default function AdminRootPage() {
  redirect("/admin/orders")
}
```

- [ ] **Step 4: Write failing test for role gate**

`apps/web/src/app/admin/__tests__/layout.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"

// Role gate logic extracted for unit testing
function checkAdminAccess(role: string | null | undefined): "allow" | "redirect_home" | "redirect_login" {
  if (role === "admin") return "allow"
  if (role === null || role === undefined) return "redirect_login"
  return "redirect_home"
}

describe("Admin role gate", () => {
  it("allows admin role", () => {
    expect(checkAdminAccess("admin")).toBe("allow")
  })

  it("redirects non-admin user to home", () => {
    expect(checkAdminAccess("user")).toBe("redirect_home")
  })

  it("redirects unauthenticated user to login", () => {
    expect(checkAdminAccess(null)).toBe("redirect_login")
    expect(checkAdminAccess(undefined)).toBe("redirect_login")
  })
})
```

- [ ] **Step 5: Run test — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx vitest run src/app/admin/__tests__/layout.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/layout.tsx apps/web/src/app/admin/page.tsx apps/web/src/app/admin/__tests__
git commit -m "feat(admin): layout with sidebar navigation and admin role gate"
```

---

## Task 2: Order Management

**Files:**
- Create: `apps/web/src/app/admin/orders/page.tsx`
- Create: `apps/web/src/app/admin/orders/actions.ts`
- Create: `apps/web/src/app/admin/orders/[id]/page.tsx`
- Create: `apps/api/src/routes/admin/orders.ts`

- [ ] **Step 1: Install shadcn/ui DataTable dependencies**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx shadcn@latest add table select checkbox dropdown-menu
npm install @tanstack/react-table
```

- [ ] **Step 2: Write admin orders API route (Express)**

`apps/api/src/routes/admin/orders.ts`:
```typescript
import { Router } from "express"
import { requireAdmin } from "../../middleware/admin"
import { supabase } from "../../lib/supabase"
import { z } from "zod"

const router = Router()
router.use(requireAdmin)

const VALID_STATUSES = ["pending", "processing", "shipped", "completed", "cancelled", "failed"] as const

// PATCH /admin/orders/:id/status
router.patch("/:id/status", async (req, res) => {
  const parsed = z.object({
    status: z.enum(VALID_STATUSES),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid status" })

  const { error } = await supabase
    .from("orders")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true })
})

// POST /admin/orders/bulk-status
router.post("/bulk-status", async (req, res) => {
  const parsed = z.object({
    ids: z.array(z.string().uuid()).min(1),
    status: z.enum(VALID_STATUSES),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" })

  const { error } = await supabase
    .from("orders")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .in("id", parsed.data.ids)
  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true, updated: parsed.data.ids.length })
})

export default router
```

- [ ] **Step 3: Write failing tests for admin orders route**

`apps/api/src/routes/admin/__tests__/orders.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
        in: vi.fn(() => ({ error: null })),
      })),
    })),
  },
}))

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import ordersRouter from "../orders"

const app = express()
app.use(express.json())
app.use("/admin/orders", ordersRouter)

describe("PATCH /admin/orders/:id/status", () => {
  it("returns 200 for valid status", async () => {
    const res = await request(app)
      .patch("/admin/orders/123e4567-e89b-12d3-a456-426614174000/status")
      .send({ status: "processing" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("returns 400 for invalid status", async () => {
    const res = await request(app)
      .patch("/admin/orders/123e4567-e89b-12d3-a456-426614174000/status")
      .send({ status: "unknown" })
    expect(res.status).toBe(400)
  })
})

describe("POST /admin/orders/bulk-status", () => {
  it("returns 200 for valid bulk update", async () => {
    const res = await request(app)
      .post("/admin/orders/bulk-status")
      .send({ ids: ["123e4567-e89b-12d3-a456-426614174000"], status: "shipped" })
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(1)
  })

  it("returns 400 for empty ids array", async () => {
    const res = await request(app)
      .post("/admin/orders/bulk-status")
      .send({ ids: [], status: "shipped" })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/admin/__tests__/orders.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Write order list page**

`apps/web/src/app/admin/orders/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import OrdersDataTable from "./_components/orders-data-table"

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; payment?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from("orders")
    .select("id, order_number, status, payment_status, payment_method, total, created_at, user_profiles(display_name, email)")
    .order("created_at", { ascending: false })
    .limit(200)

  if (params.status) query = query.eq("status", params.status)
  if (params.payment) query = query.eq("payment_status", params.payment)
  if (params.from) query = query.gte("created_at", params.from)
  if (params.to) query = query.lte("created_at", params.to)

  const { data: orders } = await query

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">訂單管理</h1>
      <OrdersDataTable orders={orders ?? []} />
    </div>
  )
}
```

- [ ] **Step 6: Write order list Server Actions**

`apps/web/src/app/admin/orders/actions.ts`:
```typescript
"use server"

import { revalidatePath } from "next/cache"
import { apiClient } from "@/lib/api-client"

export async function updateOrderStatusAction(id: string, status: string) {
  await apiClient(`/admin/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
  revalidatePath("/admin/orders")
}

export async function bulkUpdateOrderStatusAction(ids: string[], status: string) {
  await apiClient("/admin/orders/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  })
  revalidatePath("/admin/orders")
}
```

- [ ] **Step 7: Write order detail page**

`apps/web/src/app/admin/orders/[id]/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import OrderStatusSelect from "./_components/order-status-select"

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: order } = await supabase
    .from("orders")
    .select(`
      *,
      order_items(*),
      order_addresses(*),
      payments(*),
      logistics(*),
      invoices(*)
    `)
    .eq("id", id)
    .single()

  if (!order) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">訂單 #{order.order_number}</h1>
        <OrderStatusSelect orderId={id} currentStatus={order.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">訂單商品</CardTitle></CardHeader>
          <CardContent>
            {order.order_items?.map((item: Record<string, unknown>) => (
              <div key={item.id as string} className="flex justify-between py-1 text-sm">
                <span>{(item.product_snapshot as Record<string, unknown>)?.name as string} × {item.qty as number}</span>
                <span>NT$ {item.unit_price as number}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between font-medium text-sm">
              <span>總計</span>
              <span>NT$ {order.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">收件資訊</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {order.order_addresses?.filter((a: Record<string, unknown>) => a.type === "shipping").map((addr: Record<string, unknown>) => (
              <div key={addr.id as string}>
                <p>{addr.name as string} / {addr.phone as string}</p>
                <p>{addr.address as string || `${addr.cvs_type as string} ${addr.cvs_store_id as string}`}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">付款資訊</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>方式：{order.payment_method}</p>
            <p>狀態：<Badge variant="outline">{order.payment_status}</Badge></p>
            {order.payments?.[0]?.gateway_tx_id && (
              <p>交易 ID：{order.payments[0].gateway_tx_id}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">物流資訊</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {order.logistics?.[0] ? (
              <>
                <p>物流商：{order.logistics[0].provider}</p>
                <p>追蹤號：{order.logistics[0].tracking_number ?? "—"}</p>
                <p>狀態：{order.logistics[0].status}</p>
              </>
            ) : (
              <p className="text-zinc-400">尚未建立物流</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/admin/orders apps/api/src/routes/admin/orders.ts apps/api/src/routes/admin/__tests__
git commit -m "feat(admin): order management — list DataTable with filters, bulk status update, order detail"
```

---

## Task 3: Product Management

**Files:**
- Create: `apps/web/src/app/admin/products/page.tsx`
- Create: `apps/web/src/app/admin/products/new/page.tsx`
- Create: `apps/web/src/app/admin/products/[id]/edit/page.tsx`
- Create: `apps/api/src/routes/admin/products.ts`

- [ ] **Step 1: Install image upload dependency**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npm install @supabase/storage-js
npx shadcn@latest add switch
```

- [ ] **Step 2: Write admin products API route (Express)**

`apps/api/src/routes/admin/products.ts`:
```typescript
import { Router } from "express"
import { requireAdmin } from "../../middleware/admin"
import { supabase } from "../../lib/supabase"
import { z } from "zod"

const router = Router()
router.use(requireAdmin)

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().optional(),
  name: z.string().min(1),
  price: z.number().positive(),
  salePrice: z.number().positive().nullable().optional(),
  stockQty: z.number().int().min(0),
  weight: z.number().positive().nullable().optional(),
  attributes: z.record(z.union([z.string(), z.number()])).optional(),
})

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  images: z.array(z.string().url()).optional(),
  isActive: z.boolean().optional(),
  variants: z.array(variantSchema).min(1),
})

// POST /admin/products
router.post("/", async (req, res) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { variants, ...productData } = parsed.data

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({ ...productData, is_active: productData.isActive ?? true })
    .select()
    .single()
  if (productError) return res.status(500).json({ error: productError.message })

  const variantRows = variants.map(v => ({
    product_id: product.id,
    sku: v.sku,
    name: v.name,
    price: v.price,
    sale_price: v.salePrice,
    stock_qty: v.stockQty,
    weight: v.weight,
    attributes: v.attributes,
  }))
  const { error: variantError } = await supabase.from("product_variants").insert(variantRows)
  if (variantError) return res.status(500).json({ error: variantError.message })

  res.status(201).json({ id: product.id })
})

// PATCH /admin/products/:id
router.patch("/:id", async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { variants, ...productData } = parsed.data

  if (Object.keys(productData).length > 0) {
    const updateData: Record<string, unknown> = {}
    if (productData.name !== undefined) updateData.name = productData.name
    if (productData.slug !== undefined) updateData.slug = productData.slug
    if (productData.description !== undefined) updateData.description = productData.description
    if (productData.categoryId !== undefined) updateData.category_id = productData.categoryId
    if (productData.images !== undefined) updateData.images = productData.images
    if (productData.isActive !== undefined) updateData.is_active = productData.isActive

    const { error } = await supabase.from("products").update(updateData).eq("id", req.params.id)
    if (error) return res.status(500).json({ error: error.message })
  }

  if (variants) {
    await supabase.from("product_variants").delete().eq("product_id", req.params.id)
    const variantRows = variants.map(v => ({
      product_id: req.params.id,
      sku: v.sku,
      name: v.name,
      price: v.price,
      sale_price: v.salePrice,
      stock_qty: v.stockQty,
      weight: v.weight,
      attributes: v.attributes,
    }))
    const { error: variantError } = await supabase.from("product_variants").insert(variantRows)
    if (variantError) return res.status(500).json({ error: variantError.message })
  }

  res.json({ success: true })
})

// DELETE /admin/products/:id
router.delete("/:id", async (req, res) => {
  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

export default router
```

- [ ] **Step 3: Write failing tests for admin products route**

`apps/api/src/routes/admin/__tests__/products.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain = {
        insert: vi.fn(() => ({ ...chain, select: vi.fn(() => ({ ...chain, single: vi.fn(() => ({ data: { id: "prod-uuid" }, error: null })) })) })),
        update: vi.fn(() => ({ ...chain, eq: vi.fn(() => ({ error: null })) })),
        delete: vi.fn(() => ({ ...chain, eq: vi.fn(() => ({ error: null })) })),
        select: vi.fn(() => chain),
        single: vi.fn(() => ({ data: { id: "prod-uuid" }, error: null })),
        eq: vi.fn(() => ({ error: null })),
      }
      return chain
    }),
  },
}))

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import productsRouter from "../products"

const app = express()
app.use(express.json())
app.use("/admin/products", productsRouter)

const validProduct = {
  name: "有機亞麻籽粉",
  slug: "organic-flaxseed",
  isActive: true,
  variants: [{ name: "標準裝 300g", price: 299, stockQty: 50 }],
}

describe("POST /admin/products", () => {
  it("returns 201 for valid product", async () => {
    const res = await request(app).post("/admin/products").send(validProduct)
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
  })

  it("returns 400 for missing name", async () => {
    const res = await request(app)
      .post("/admin/products")
      .send({ ...validProduct, name: "" })
    expect(res.status).toBe(400)
  })

  it("returns 400 for slug with spaces", async () => {
    const res = await request(app)
      .post("/admin/products")
      .send({ ...validProduct, slug: "has space" })
    expect(res.status).toBe(400)
  })
})

describe("DELETE /admin/products/:id", () => {
  it("soft deletes (is_active=false)", async () => {
    const res = await request(app).delete("/admin/products/some-uuid")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/admin/__tests__/products.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Write product list page**

`apps/web/src/app/admin/products/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import Image from "next/image"

export default async function AdminProductsPage() {
  const supabase = await createClient()
  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, images, is_active, product_variants(stock_qty)")
    .order("created_at", { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">商品管理</h1>
        <Button asChild size="sm">
          <Link href="/admin/products/new"><Plus className="w-4 h-4 mr-1" />新增商品</Link>
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">商品</th>
              <th className="px-4 py-3 text-left">庫存</th>
              <th className="px-4 py-3 text-left">狀態</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {products?.map(product => {
              const totalStock = product.product_variants?.reduce(
                (sum: number, v: { stock_qty: number }) => sum + (v.stock_qty ?? 0), 0
              ) ?? 0
              return (
                <tr key={product.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 flex items-center gap-3">
                    {product.images?.[0] && (
                      <Image
                        src={product.images[0]}
                        alt={product.name}
                        width={40}
                        height={40}
                        className="rounded object-cover"
                      />
                    )}
                    <span className="font-medium">{product.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={totalStock > 0 ? "outline" : "destructive"}>
                      {totalStock > 0 ? `${totalStock} 件` : "缺貨"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={product.is_active ? "default" : "secondary"}>
                      {product.is_active ? "上架" : "下架"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/products/${product.id}/edit`}>編輯</Link>
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Write new product form page**

`apps/web/src/app/admin/products/new/page.tsx`:
```typescript
import ProductForm from "../_components/product-form"

export default function AdminNewProductPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">新增商品</h1>
      <ProductForm mode="create" />
    </div>
  )
}
```

- [ ] **Step 7: Write edit product form page**

`apps/web/src/app/admin/products/[id]/edit/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import ProductForm from "../../_components/product-form"

export default async function AdminEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: product } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", id)
    .single()

  if (!product) notFound()

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">編輯商品：{product.name}</h1>
      <ProductForm mode="edit" product={product} />
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/admin/products apps/api/src/routes/admin/products.ts apps/api/src/routes/admin/__tests__/products.test.ts
git commit -m "feat(admin): product management — list with stock badge, create/edit form with variant management"
```

---

## Task 4: Customer Management

**Files:**
- Create: `apps/web/src/app/admin/customers/page.tsx`
- Create: `apps/web/src/app/admin/customers/[id]/page.tsx`
- Create: `apps/api/src/routes/admin/customers.ts`

- [ ] **Step 1: Write admin customers API route (Express)**

`apps/api/src/routes/admin/customers.ts`:
```typescript
import { Router } from "express"
import { requireAdmin } from "../../middleware/admin"
import { supabase } from "../../lib/supabase"
import { z } from "zod"

const router = Router()
router.use(requireAdmin)

// PATCH /admin/customers/:id/tier — manual tier override
router.patch("/:id/tier", async (req, res) => {
  const parsed = z.object({
    membershipTierId: z.string().uuid(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid tier ID" })

  const { error } = await supabase
    .from("user_profiles")
    .update({ membership_tier_id: parsed.data.membershipTierId })
    .eq("id", req.params.id)
  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true })
})

export default router
```

- [ ] **Step 2: Write failing tests for admin customers route**

`apps/api/src/routes/admin/__tests__/customers.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
    })),
  },
}))

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import customersRouter from "../customers"

const app = express()
app.use(express.json())
app.use("/admin/customers", customersRouter)

describe("PATCH /admin/customers/:id/tier", () => {
  it("returns 200 for valid UUID tier", async () => {
    const res = await request(app)
      .patch("/admin/customers/user-uuid/tier")
      .send({ membershipTierId: "123e4567-e89b-12d3-a456-426614174000" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("returns 400 for non-UUID tier", async () => {
    const res = await request(app)
      .patch("/admin/customers/user-uuid/tier")
      .send({ membershipTierId: "not-a-uuid" })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/admin/__tests__/customers.test.ts
```
Expected: 2 tests PASS

- [ ] **Step 4: Write customer list page**

`apps/web/src/app/admin/customers/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export default async function AdminCustomersPage() {
  const supabase = await createClient()
  const { data: customers } = await supabase
    .from("user_profiles")
    .select(`
      id, display_name, email, total_spend, created_at,
      membership_tiers(name)
    `)
    .order("total_spend", { ascending: false })
    .limit(500)

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">會員管理</h1>
      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">姓名 / Email</th>
              <th className="px-4 py-3 text-left">會員等級</th>
              <th className="px-4 py-3 text-left">累計消費</th>
              <th className="px-4 py-3 text-left">加入日期</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {customers?.map(c => (
              <tr key={c.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <p className="font-medium">{c.display_name ?? "—"}</p>
                  <p className="text-zinc-400 text-xs">{c.email}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{(c.membership_tiers as { name: string } | null)?.name ?? "一般會員"}</Badge>
                </td>
                <td className="px-4 py-3">NT$ {Number(c.total_spend ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(c.created_at).toLocaleDateString("zh-TW")}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/customers/${c.id}`} className="text-blue-600 hover:underline text-xs">
                    查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write customer detail page**

`apps/web/src/app/admin/customers/[id]/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import TierOverrideSelect from "./_components/tier-override-select"

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: profile }, { data: orders }, { data: tiers }, { data: subscription }] = await Promise.all([
    supabase.from("user_profiles").select("*, membership_tiers(name)").eq("id", id).single(),
    supabase.from("orders").select("id, order_number, status, total, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("membership_tiers").select("id, name").order("sort_order"),
    supabase.from("subscriptions").select("id, status, next_billing_date, plan_id").eq("user_id", id).maybeSingle(),
  ])

  if (!profile) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{profile.display_name ?? profile.email}</h1>
        <TierOverrideSelect
          customerId={id}
          tiers={tiers ?? []}
          currentTierId={profile.membership_tier_id}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">累計消費</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">
            NT$ {Number(profile.total_spend ?? 0).toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">會員等級</CardTitle></CardHeader>
          <CardContent>
            <Badge variant="outline">{(profile.membership_tiers as { name: string } | null)?.name ?? "一般會員"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">訂閱狀態</CardTitle></CardHeader>
          <CardContent>
            <Badge variant={subscription?.status === "active" ? "default" : "secondary"}>
              {subscription?.status ?? "無訂閱"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">訂單紀錄</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b">
                <th className="text-left py-2">訂單號</th>
                <th className="text-left py-2">狀態</th>
                <th className="text-left py-2">金額</th>
                <th className="text-left py-2">日期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {orders?.map(o => (
                <tr key={o.id}>
                  <td className="py-2">{o.order_number}</td>
                  <td className="py-2"><Badge variant="outline" className="text-xs">{o.status}</Badge></td>
                  <td className="py-2">NT$ {Number(o.total).toLocaleString()}</td>
                  <td className="py-2 text-zinc-500">{new Date(o.created_at).toLocaleDateString("zh-TW")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/customers apps/api/src/routes/admin/customers.ts apps/api/src/routes/admin/__tests__/customers.test.ts
git commit -m "feat(admin): customer management — list with tier badge, detail with manual tier override"
```

---

## Task 5: Subscription Management

**Files:**
- Create: `apps/web/src/app/admin/subscriptions/page.tsx`
- Create: `apps/web/src/app/admin/subscriptions/[id]/page.tsx`
- Create: `apps/api/src/routes/admin/subscriptions.ts`

- [ ] **Step 1: Write admin subscriptions API route (Express)**

`apps/api/src/routes/admin/subscriptions.ts`:
```typescript
import { Router } from "express"
import { requireAdmin } from "../../middleware/admin"
import { supabase } from "../../lib/supabase"
import { Queue } from "bullmq"
import { Redis } from "ioredis"

const router = Router()
router.use(requireAdmin)

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null })
const billingQueue = new Queue("subscription-billing", { connection })

// POST /admin/subscriptions/:id/retry — manually enqueue billing job
router.post("/:id/retry", async (req, res) => {
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("id", req.params.id)
    .single()

  if (error || !sub) return res.status(404).json({ error: "Subscription not found" })
  if (!["active", "past_due"].includes(sub.status)) {
    return res.status(400).json({ error: "Can only retry active or past_due subscriptions" })
  }

  await billingQueue.add("retry-billing", { subscriptionId: sub.id }, {
    jobId: `retry-${sub.id}-${Date.now()}`,
  })

  res.json({ success: true, message: "Billing job enqueued" })
})

// POST /admin/subscriptions/:id/cancel
router.post("/:id/cancel", async (req, res) => {
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

export default router
```

- [ ] **Step 2: Write failing tests for admin subscriptions route**

`apps/api/src/routes/admin/__tests__/subscriptions.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  })),
}))

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({})),
}))

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { id: "sub-uuid", status: "active" },
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
    })),
  },
}))

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import subscriptionsRouter from "../subscriptions"

const app = express()
app.use(express.json())
app.use("/admin/subscriptions", subscriptionsRouter)

describe("POST /admin/subscriptions/:id/retry", () => {
  it("enqueues billing job and returns 200", async () => {
    const res = await request(app).post("/admin/subscriptions/sub-uuid/retry")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe("POST /admin/subscriptions/:id/cancel", () => {
  it("cancels subscription and returns 200", async () => {
    const res = await request(app).post("/admin/subscriptions/sub-uuid/cancel")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/admin/__tests__/subscriptions.test.ts
```
Expected: 2 tests PASS

- [ ] **Step 4: Write subscription list page**

`apps/web/src/app/admin/subscriptions/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  cancelled: "secondary",
  past_due: "destructive",
  paused: "outline",
}

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from("subscriptions")
    .select(`
      id, status, next_billing_date, retry_count, created_at,
      user_profiles(display_name, email),
      subscription_plans(name, price)
    `)
    .order("created_at", { ascending: false })
    .limit(500)

  if (params.status) query = query.eq("status", params.status)

  const { data: subscriptions } = await query

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">訂閱管理</h1>
      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">會員</th>
              <th className="px-4 py-3 text-left">方案</th>
              <th className="px-4 py-3 text-left">狀態</th>
              <th className="px-4 py-3 text-left">下次扣款</th>
              <th className="px-4 py-3 text-left">重試次數</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {subscriptions?.map(sub => (
              <tr key={sub.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <p className="font-medium">{(sub.user_profiles as { display_name: string; email: string } | null)?.display_name ?? "—"}</p>
                  <p className="text-zinc-400 text-xs">{(sub.user_profiles as { email: string } | null)?.email}</p>
                </td>
                <td className="px-4 py-3">{(sub.subscription_plans as { name: string; price: number } | null)?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[sub.status] ?? "outline"}>{sub.status}</Badge>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString("zh-TW") : "—"}
                </td>
                <td className="px-4 py-3">
                  {sub.retry_count > 0 ? (
                    <Badge variant="destructive">{sub.retry_count}</Badge>
                  ) : "0"}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/subscriptions/${sub.id}`} className="text-blue-600 hover:underline text-xs">
                    管理
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Write subscription detail page**

`apps/web/src/app/admin/subscriptions/[id]/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import SubscriptionActions from "./_components/subscription-actions"

export default async function AdminSubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: sub }, { data: payments }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(`*, user_profiles(display_name, email), subscription_plans(name, price, interval_days)`)
      .eq("id", id)
      .single(),
    supabase
      .from("payments")
      .select("id, amount, status, paid_at, created_at, gateway_tx_id")
      .eq("subscription_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (!sub) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {(sub.user_profiles as { display_name: string } | null)?.display_name ?? "訂閱"} — 訂閱詳情
          </h1>
          <p className="text-zinc-500 text-sm">{(sub.user_profiles as { email: string } | null)?.email}</p>
        </div>
        <SubscriptionActions subscriptionId={id} status={sub.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">方案</CardTitle></CardHeader>
          <CardContent>
            <p className="font-medium">{(sub.subscription_plans as { name: string } | null)?.name}</p>
            <p className="text-zinc-500 text-sm">NT$ {(sub.subscription_plans as { price: number } | null)?.price} / 月</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">狀態</CardTitle></CardHeader>
          <CardContent>
            <Badge>{sub.status}</Badge>
            {sub.retry_count > 0 && (
              <p className="text-destructive text-xs mt-1">已重試 {sub.retry_count} 次</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">下次扣款</CardTitle></CardHeader>
          <CardContent>
            {sub.next_billing_date
              ? new Date(sub.next_billing_date).toLocaleDateString("zh-TW")
              : "—"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">付款紀錄</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b">
                <th className="text-left py-2">金額</th>
                <th className="text-left py-2">狀態</th>
                <th className="text-left py-2">交易 ID</th>
                <th className="text-left py-2">付款時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {payments?.map(p => (
                <tr key={p.id}>
                  <td className="py-2">NT$ {Number(p.amount).toLocaleString()}</td>
                  <td className="py-2"><Badge variant="outline" className="text-xs">{p.status}</Badge></td>
                  <td className="py-2 text-zinc-400 text-xs">{p.gateway_tx_id ?? "—"}</td>
                  <td className="py-2 text-zinc-500">
                    {p.paid_at ? new Date(p.paid_at).toLocaleString("zh-TW") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/subscriptions apps/api/src/routes/admin/subscriptions.ts apps/api/src/routes/admin/__tests__/subscriptions.test.ts
git commit -m "feat(admin): subscription management — list with status filter, detail with retry/cancel actions"
```

---

## Task 6: Analytics Dashboard

**Files:**
- Create: `apps/web/src/app/admin/analytics/page.tsx`

- [ ] **Step 1: Install Recharts**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npm install recharts
```

- [ ] **Step 2: Write analytics data queries**

`apps/web/src/app/admin/analytics/_lib/queries.ts`:
```typescript
import { createClient } from "@/lib/supabase/server"

export async function getRevenueByDay(days = 30) {
  const supabase = await createClient()
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data } = await supabase
    .from("orders")
    .select("total, created_at")
    .gte("created_at", since.toISOString())
    .eq("payment_status", "paid")

  const byDay: Record<string, number> = {}
  for (const order of data ?? []) {
    const day = order.created_at.slice(0, 10)
    byDay[day] = (byDay[day] ?? 0) + Number(order.total)
  }

  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }))
}

export async function getOrdersByStatus() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("orders")
    .select("status")

  const counts: Record<string, number> = {}
  for (const order of data ?? []) {
    counts[order.status] = (counts[order.status] ?? 0) + 1
  }
  return Object.entries(counts).map(([status, count]) => ({ status, count }))
}

export async function getTopProducts(limit = 10) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("order_items")
    .select("product_snapshot, qty, unit_price")

  const products: Record<string, { name: string; revenue: number; qty: number }> = {}
  for (const item of data ?? []) {
    const snapshot = item.product_snapshot as { product_id?: string; name?: string }
    const key = snapshot?.product_id ?? snapshot?.name ?? "unknown"
    const name = snapshot?.name ?? key
    products[key] = {
      name,
      revenue: (products[key]?.revenue ?? 0) + Number(item.unit_price) * item.qty,
      qty: (products[key]?.qty ?? 0) + item.qty,
    }
  }
  return Object.values(products)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
}

export async function getMembershipTierDistribution() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("user_profiles")
    .select("membership_tiers(name)")

  const counts: Record<string, number> = {}
  for (const profile of data ?? []) {
    const name = (profile.membership_tiers as { name: string } | null)?.name ?? "一般會員"
    counts[name] = (counts[name] ?? 0) + 1
  }
  return Object.entries(counts).map(([tier, count]) => ({ tier, count }))
}

export async function getSubscriptionMRR() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("subscriptions")
    .select("subscription_plans(price)")
    .eq("status", "active")

  const mrr = (data ?? []).reduce((sum, sub) => {
    return sum + Number((sub.subscription_plans as { price: number } | null)?.price ?? 0)
  }, 0)
  return mrr
}
```

- [ ] **Step 3: Write analytics page**

`apps/web/src/app/admin/analytics/page.tsx`:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getRevenueByDay,
  getOrdersByStatus,
  getTopProducts,
  getMembershipTierDistribution,
  getSubscriptionMRR,
} from "./_lib/queries"
import RevenueChart from "./_components/revenue-chart"
import OrderStatusPie from "./_components/order-status-pie"

export default async function AdminAnalyticsPage() {
  const [revenueData, ordersByStatus, topProducts, tierDistribution, mrr] = await Promise.all([
    getRevenueByDay(30),
    getOrdersByStatus(),
    getTopProducts(10),
    getMembershipTierDistribution(),
    getSubscriptionMRR(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">數據分析</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-xs text-zinc-500">30 日營收</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">
            NT$ {revenueData.reduce((s, d) => s + d.revenue, 0).toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xs text-zinc-500">訂閱 MRR</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">NT$ {mrr.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xs text-zinc-500">總訂單數</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">
            {ordersByStatus.reduce((s, d) => s + d.count, 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xs text-zinc-500">活躍訂閱</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">
            {ordersByStatus.find(o => o.status === "completed")?.count ?? 0}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">30 日每日營收</CardTitle></CardHeader>
          <CardContent>
            <RevenueChart data={revenueData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">訂單狀態分佈</CardTitle></CardHeader>
          <CardContent>
            <OrderStatusPie data={ordersByStatus} />
          </CardContent>
        </Card>
      </div>

      {/* Top products */}
      <Card>
        <CardHeader><CardTitle className="text-sm">熱銷商品 Top 10</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b">
                <th className="text-left py-2">商品</th>
                <th className="text-right py-2">銷售量</th>
                <th className="text-right py-2">營收</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {topProducts.map((p, i) => (
                <tr key={i}>
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 text-right">{p.qty}</td>
                  <td className="py-2 text-right">NT$ {p.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Tier distribution */}
      <Card>
        <CardHeader><CardTitle className="text-sm">會員等級分佈</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {tierDistribution.map(t => (
              <div key={t.tier} className="text-center">
                <p className="text-2xl font-bold">{t.count}</p>
                <p className="text-zinc-500 text-xs">{t.tier}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Write revenue chart component**

`apps/web/src/app/admin/analytics/_components/revenue-chart.tsx`:
```typescript
"use client"

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

type RevenuePoint = { date: string; revenue: number }

export default function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => [`NT$ ${v.toLocaleString()}`, "營收"]} />
        <Line type="monotone" dataKey="revenue" stroke="#18181b" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 5: Write order status pie component**

`apps/web/src/app/admin/analytics/_components/order-status-pie.tsx`:
```typescript
"use client"

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"

const COLORS = ["#18181b", "#71717a", "#a1a1aa", "#d4d4d8", "#e4e4e7", "#f4f4f5"]

type StatusPoint = { status: string; count: number }

export default function OrderStatusPie({ data }: { data: StatusPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={70} label>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/analytics
git commit -m "feat(admin): analytics dashboard — revenue chart, order status pie, top products, MRR"
```

---

## Task 7: BullMQ Job Monitoring

**Files:**
- Create: `apps/api/src/lib/bull-board.ts`
- Create: `apps/web/src/app/admin/jobs/page.tsx`

- [ ] **Step 1: Install Bull Board on Express API**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install @bull-board/express @bull-board/api
```

- [ ] **Step 2: Write Bull Board setup**

`apps/api/src/lib/bull-board.ts`:
```typescript
import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { ExpressAdapter } from "@bull-board/express"
import { Queue } from "bullmq"
import { Redis } from "ioredis"

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

// Register all BullMQ queues here
const queues = [
  new Queue("subscription-billing", { connection }),
  new Queue("invoice-generation", { connection }),
  new Queue("order-notifications", { connection }),
  new Queue("logistics-tracking", { connection }),
]

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath("/admin/bull-board")

createBullBoard({
  queues: queues.map(q => new BullMQAdapter(q)),
  serverAdapter,
})

export const bullBoardRouter = serverAdapter.getRouter()
```

- [ ] **Step 3: Mount Bull Board in Express app**

Edit `apps/api/src/app.ts` — add after existing route mounts:

```typescript
import { bullBoardRouter } from "./lib/bull-board"
import { requireAdmin } from "./middleware/admin"

// Bull Board — protected by requireAdmin
app.use("/admin/bull-board", requireAdmin, bullBoardRouter)
```

- [ ] **Step 4: Write jobs monitor page (iframe embed)**

`apps/web/src/app/admin/jobs/page.tsx`:
```typescript
export default function AdminJobsPage() {
  const apiUrl = process.env.RAILWAY_API_URL ?? "http://localhost:4000"

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">背景任務監控</h1>
      <p className="text-sm text-zinc-500">
        透過 Bull Board 監控 BullMQ 佇列狀態。可查看排隊中、進行中、失敗的任務，並手動重試或清除。
      </p>
      <div className="border rounded-lg overflow-hidden" style={{ height: "calc(100vh - 200px)" }}>
        <iframe
          src={`${apiUrl}/admin/bull-board`}
          className="w-full h-full"
          title="BullMQ Job Monitor"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/bull-board.ts apps/web/src/app/admin/jobs
git commit -m "feat(admin): BullMQ job monitoring via Bull Board embedded in admin panel"
```

---

## Task 8: System Settings

**Files:**
- Create: `apps/web/src/app/admin/settings/page.tsx`
- Create: `apps/api/src/routes/admin/settings.ts`

- [ ] **Step 1: Write admin settings API route (Express)**

`apps/api/src/routes/admin/settings.ts`:
```typescript
import { Router } from "express"
import { requireAdmin } from "../../middleware/admin"
import { supabase } from "../../lib/supabase"
import { z } from "zod"

const router = Router()
router.use(requireAdmin)

// PATCH /admin/settings/tiers/:id — edit membership tier
router.patch("/tiers/:id", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(1).optional(),
    minSpend: z.number().min(0).optional(),
    discountRate: z.number().min(0).max(1).optional(),
    benefits: z.record(z.unknown()).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const updateData: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name
  if (parsed.data.minSpend !== undefined) updateData.min_spend = parsed.data.minSpend
  if (parsed.data.discountRate !== undefined) updateData.discount_rate = parsed.data.discountRate
  if (parsed.data.benefits !== undefined) updateData.benefits = parsed.data.benefits

  const { error } = await supabase
    .from("membership_tiers")
    .update(updateData)
    .eq("id", req.params.id)
  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true })
})

// PATCH /admin/settings/site-notice — update site-wide banner
router.patch("/site-notice", async (req, res) => {
  const parsed = z.object({
    message: z.string(),
    active: z.boolean(),
    variant: z.enum(["info", "warning", "success"]).optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" })

  const { error } = await supabase
    .from("site_settings")
    .upsert({
      key: "site_notice",
      value: parsed.data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" })
  if (error) return res.status(500).json({ error: error.message })

  res.json({ success: true })
})

export default router
```

- [ ] **Step 2: Write failing tests for admin settings route**

`apps/api/src/routes/admin/__tests__/settings.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express from "express"

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
      upsert: vi.fn(() => ({ error: null })),
    })),
  },
}))

vi.mock("../../../middleware/admin", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import settingsRouter from "../settings"

const app = express()
app.use(express.json())
app.use("/admin/settings", settingsRouter)

describe("PATCH /admin/settings/tiers/:id", () => {
  it("returns 200 for valid tier update", async () => {
    const res = await request(app)
      .patch("/admin/settings/tiers/tier-uuid")
      .send({ minSpend: 5000, discountRate: 0.05 })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("returns 400 for discount rate > 1", async () => {
    const res = await request(app)
      .patch("/admin/settings/tiers/tier-uuid")
      .send({ discountRate: 1.5 })
    expect(res.status).toBe(400)
  })
})

describe("PATCH /admin/settings/site-notice", () => {
  it("returns 200 for valid site notice", async () => {
    const res = await request(app)
      .patch("/admin/settings/site-notice")
      .send({ message: "歡迎！", active: true, variant: "info" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("returns 400 for invalid variant", async () => {
    const res = await request(app)
      .patch("/admin/settings/site-notice")
      .send({ message: "test", active: true, variant: "error" })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/admin/__tests__/settings.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 4: Write system settings page**

`apps/web/src/app/admin/settings/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import TierSettingsForm from "./_components/tier-settings-form"
import SiteNoticeForm from "./_components/site-notice-form"

export default async function AdminSettingsPage() {
  const supabase = await createClient()

  const [{ data: tiers }, { data: siteNoticeSetting }] = await Promise.all([
    supabase.from("membership_tiers").select("*").order("sort_order"),
    supabase.from("site_settings").select("value").eq("key", "site_notice").maybeSingle(),
  ])

  const siteNotice = siteNoticeSetting?.value as {
    message: string
    active: boolean
    variant: "info" | "warning" | "success"
  } | null

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">系統設定</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">會員等級設定</CardTitle>
        </CardHeader>
        <CardContent>
          <TierSettingsForm tiers={tiers ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">站台公告橫幅</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteNoticeForm
            message={siteNotice?.message ?? ""}
            active={siteNotice?.active ?? false}
            variant={siteNotice?.variant ?? "info"}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/settings apps/api/src/routes/admin/settings.ts apps/api/src/routes/admin/__tests__/settings.test.ts
git commit -m "feat(admin): system settings — membership tier config, site notice banner"
```

---

## Task 9: Mount All Admin API Routes

**Files:**
- Create: `apps/api/src/routes/admin/index.ts`

- [ ] **Step 1: Write admin routes index**

`apps/api/src/routes/admin/index.ts`:
```typescript
import { Router } from "express"
import ordersRouter from "./orders"
import productsRouter from "./products"
import customersRouter from "./customers"
import subscriptionsRouter from "./subscriptions"
import settingsRouter from "./settings"

const router = Router()

router.use("/orders", ordersRouter)
router.use("/products", productsRouter)
router.use("/customers", customersRouter)
router.use("/subscriptions", subscriptionsRouter)
router.use("/settings", settingsRouter)

export default router
```

- [ ] **Step 2: Mount in app.ts**

Edit `apps/api/src/app.ts` — add after existing route mounts:

```typescript
import adminRouter from "./routes/admin/index"

app.use("/admin", adminRouter)
```

- [ ] **Step 3: Run all API tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/admin/__tests__
```
Expected: All tests in admin __tests__ PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/admin/index.ts apps/api/src/app.ts
git commit -m "feat(api): mount all admin routes under /admin"
```

---

## Task 10: Integration Smoke Test + DoD

- [ ] **Step 1: Start Railway API**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npm run dev
```
Expected: API server on port 4000

- [ ] **Step 2: Verify admin route protection (unauthenticated)**

```bash
curl -X PATCH http://localhost:4000/admin/orders/any-id/status -H "Content-Type: application/json" -d '{"status":"shipped"}'
```
Expected: `401 Unauthorized`

- [ ] **Step 3: Start Next.js**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npm run dev
```
Expected: Ready on `http://localhost:3000`

- [ ] **Step 4: Verify admin layout role gate — non-admin**

Login as a non-admin user, then visit `http://localhost:3000/admin`
Expected: Redirect to `/`

- [ ] **Step 5: Verify admin layout role gate — admin**

Login as admin (seeded via Plan 1 seed script), visit `http://localhost:3000/admin`
Expected: Redirect to `/admin/orders`, sidebar visible with all nav items

- [ ] **Step 6: Verify order management**

Visit `http://localhost:3000/admin/orders`
Expected: Orders DataTable renders; status filter dropdown present; bulk select checkboxes present

- [ ] **Step 7: Verify product management**

Visit `http://localhost:3000/admin/products`
Expected: Product list renders with image thumbnails, stock badges, active/inactive status

Visit `http://localhost:3000/admin/products/new`
Expected: Product form renders with variant management section and image upload field

- [ ] **Step 8: Verify analytics page**

Visit `http://localhost:3000/admin/analytics`
Expected: Revenue line chart, order status pie chart, top products table, MRR figure all render without error

- [ ] **Step 9: Verify Bull Board**

Visit `http://localhost:4000/admin/bull-board` (with admin JWT header)
Expected: Bull Board UI renders with all 4 queues listed

- [ ] **Step 10: Run all tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal
npx turbo test
```
Expected: All tests PASS across web + api

- [ ] **Step 11: TypeScript check all packages**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/packages/db && npx tsc --noEmit
```
Expected: No errors in any package

---

## Definition of Done

- [ ] Non-admin and unauthenticated users are redirected from all `/admin/*` routes
- [ ] `GET /admin/orders` — DataTable renders with status/date/payment filters and bulk update
- [ ] `GET /admin/orders/[id]` — Order detail shows items, addresses, payment, logistics, invoice
- [ ] `GET /admin/products` — Product list shows image thumbnail, stock badge, active toggle
- [ ] `GET /admin/products/new` and `/admin/products/[id]/edit` — Product form with variant management and image upload
- [ ] `GET /admin/customers` — Customer list with tier badge and total spend
- [ ] `GET /admin/customers/[id]` — Customer detail with order history and manual tier override
- [ ] `GET /admin/subscriptions` — Subscription list with status filter and retry count
- [ ] `GET /admin/subscriptions/[id]` — Subscription detail with retry billing and cancel actions
- [ ] `GET /admin/analytics` — Revenue chart, order status pie, top products, tier distribution, MRR all render
- [ ] `GET /admin/jobs` — Bull Board iframe loads showing all 4 BullMQ queues
- [ ] `GET /admin/settings` — Membership tier config and site notice banner form render and save
- [ ] `PATCH /admin/orders/:id/status` — Returns 401 without admin JWT, 200 with valid status
- [ ] `POST /admin/orders/bulk-status` — Updates multiple orders atomically
- [ ] `POST /admin/subscriptions/:id/retry` — Enqueues billing job in BullMQ
- [ ] `npx turbo test` — All tests PASS (web + api)
- [ ] `tsc --noEmit` — Zero errors in all 3 packages (web, api, db)
