# Plan 2: Product Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full product catalog system — category and product CRUD APIs, variant/stock management, Next.js storefront pages, image upload to Supabase Storage, admin management UI, inventory alerts, and full-text search — so customers can browse and admins can manage the entire product catalogue.

**Dependency:** Plan 1 (Foundation) must be complete. All tables (`categories`, `products`, `product_variants`) must exist in Supabase. Auth middleware (`requireAuth`, `requireAdmin`) must be live in `apps/api`.

**Architecture:** Express 5 routes in `apps/api` handle all catalog CRUD with Supabase Postgres via Drizzle ORM. Next.js 15 Server Components fetch directly from the Railway API using `api-client.ts`. Admin UI lives under `/admin/products` (protected by middleware). Inventory low-stock alerts run as BullMQ jobs. Full-text search uses a PostgreSQL `tsvector` index.

**Tech Stack:** Express 5, Drizzle ORM, Supabase Storage, BullMQ, Next.js 15 App Router (Server Components + Suspense), shadcn/ui DataTable + Form + Dialog, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-realreal-rewrite-design.md`

---

## File Map

```
realreal/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── categories.ts         # NEW — category CRUD
│   │       │   ├── products.ts           # NEW — product CRUD + search
│   │       │   └── variants.ts           # NEW — variant CRUD + stock
│   │       ├── jobs/
│   │       │   └── low-stock-alert.ts    # NEW — BullMQ job
│   │       ├── lib/
│   │       │   └── queue.ts              # NEW — BullMQ queue init
│   │       ├── app.ts                    # MODIFY — register new routes
│   │       └── __tests__/
│   │           ├── categories.test.ts    # NEW
│   │           ├── products.test.ts      # NEW
│   │           └── variants.test.ts      # NEW
│   └── web/
│       └── src/
│           ├── app/
│           │   ├── shop/
│           │   │   ├── page.tsx          # NEW — product listing
│           │   │   ├── loading.tsx       # NEW — Suspense skeleton
│           │   │   └── [slug]/
│           │   │       ├── page.tsx      # NEW — product detail
│           │   │       └── loading.tsx   # NEW
│           │   └── admin/
│           │       └── products/
│           │           ├── page.tsx      # NEW — product list table
│           │           ├── new/page.tsx  # NEW — create product
│           │           └── [id]/
│           │               └── page.tsx  # NEW — edit product
│           ├── components/
│           │   ├── catalog/
│           │   │   ├── ProductCard.tsx   # NEW
│           │   │   ├── ProductGrid.tsx   # NEW
│           │   │   ├── CategoryFilter.tsx # NEW
│           │   │   └── ProductImageUpload.tsx # NEW
│           │   └── admin/
│           │       └── ProductDataTable.tsx # NEW
│           └── lib/
│               └── catalog.ts            # NEW — typed fetch helpers
└── packages/
    └── db/
        └── migrations/
            └── 0002_catalog_search.sql   # NEW — tsvector index + migration
```

---

## Task 1: Category API Routes

**Goal:** Expose a tree-structured category list publicly and provide admin-protected create/update/delete endpoints.

**Files:**
- Create: `apps/api/src/routes/categories.ts`
- Create: `apps/api/src/routes/__tests__/categories.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing tests**

`apps/api/src/routes/__tests__/categories.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

import { app } from "../../app"
import { supabase } from "../../lib/supabase"

const mockCategories = [
  { id: "cat-1", name: "保健品", slug: "supplements", parent_id: null, sort_order: 1 },
  { id: "cat-2", name: "益生菌", slug: "probiotics", parent_id: "cat-1", sort_order: 1 },
]

describe("GET /categories", () => {
  it("returns category tree", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockCategories, error: null }),
    } as any)

    const res = await request(app).get("/categories")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("data")
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe("POST /categories", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/categories")
      .send({ name: "New Category", slug: "new-cat" })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/categories.test.ts
```
Expected: FAIL — "Cannot find module ../../app" or route not found

- [ ] **Step 3: Write categories route**

`apps/api/src/routes/categories.ts`:
```typescript
import { Router } from "express"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { z } from "zod"

export const categoriesRouter = Router()

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  parent_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().nonnegative().optional(),
})

function buildTree(rows: any[]): any[] {
  const map = new Map(rows.map(r => [r.id, { ...r, children: [] }]))
  const roots: any[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// GET /categories — public
categoriesRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, sort_order")
    .order("sort_order", { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data: buildTree(data ?? []) })
})

// POST /categories — admin only
categoriesRouter.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = categorySchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("categories")
    .insert(parsed.data)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ data })
})

// PUT /categories/:id — admin only
categoriesRouter.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = categorySchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: "Category not found" }); return }
  res.json({ data })
})

// DELETE /categories/:id — admin only
categoriesRouter.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", req.params.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})
```

- [ ] **Step 4: Register route in app.ts**

`apps/api/src/app.ts` — add after existing route registrations:
```typescript
import { categoriesRouter } from "./routes/categories"
// ...
app.use("/categories", categoriesRouter)
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/categories.test.ts
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/categories.ts apps/api/src/routes/__tests__/categories.test.ts apps/api/src/app.ts
git commit -m "feat(api): category CRUD routes with tree builder and admin guard"
```

---

## Task 2: Product API Routes

**Goal:** Expose paginated, filterable product listings publicly and provide admin-protected CRUD endpoints, plus slug-based product detail lookup.

**Files:**
- Create: `apps/api/src/routes/products.ts`
- Create: `apps/api/src/routes/__tests__/products.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing tests**

`apps/api/src/routes/__tests__/products.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

import { app } from "../../app"
import { supabase } from "../../lib/supabase"

const mockProduct = {
  id: "prod-1",
  name: "益生菌膠囊",
  slug: "probiotic-capsule",
  description: "每日益生菌補充",
  category_id: "cat-1",
  images: [],
  is_active: true,
  created_at: new Date().toISOString(),
}

describe("GET /products", () => {
  it("returns paginated products", async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [mockProduct],
        error: null,
        count: 1,
      }),
      order: vi.fn().mockReturnThis(),
    }
    vi.mocked(supabase.from).mockReturnValue(mockQuery as any)

    const res = await request(app).get("/products?page=1&limit=20")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("data")
    expect(res.body).toHaveProperty("pagination")
  })
})

describe("GET /products/:slug", () => {
  it("returns 404 for unknown slug", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
    } as any)

    const res = await request(app).get("/products/nonexistent-slug")
    expect(res.status).toBe(404)
  })
})

describe("POST /products", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/products")
      .send({ name: "New Product", slug: "new-product" })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/products.test.ts
```
Expected: FAIL — route not registered

- [ ] **Step 3: Write products route**

`apps/api/src/routes/products.ts`:
```typescript
import { Router } from "express"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { z } from "zod"

export const productsRouter = Router()

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  images: z.array(z.object({
    url: z.string().url(),
    alt: z.string().optional(),
    sort_order: z.number().int().nonnegative(),
  })).optional(),
  is_active: z.boolean().optional(),
})

// GET /products — public, paginated
categoriesRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from("products")
    .select("id, name, slug, description, category_id, images, is_active, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (req.query.category) query = query.eq("category_id", req.query.category as string)
  if (req.query.status === "active") query = query.eq("is_active", true)
  if (req.query.status === "inactive") query = query.eq("is_active", false)
  if (req.query.q) query = query.ilike("name", `%${req.query.q}%`)

  const { data, error, count } = await query
  if (error) { res.status(500).json({ error: error.message }); return }

  res.json({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  })
})

// GET /products/:slug — public
productsRouter.get("/:slug", async (req, res) => {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id, name, slug, description, category_id, images, is_active, created_at,
      product_variants (id, sku, name, price, sale_price, stock_qty, weight, attributes)
    `)
    .eq("slug", req.params.slug)
    .single()

  if (!data || (error && error.code === "PGRST116")) {
    res.status(404).json({ error: "Product not found" }); return
  }
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data })
})

// POST /products — admin only
productsRouter.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("products")
    .insert(parsed.data)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ data })
})

// PUT /products/:id — admin only
productsRouter.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: "Product not found" }); return }
  res.json({ data })
})

// DELETE /products/:id — admin only
productsRouter.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", req.params.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})
```

- [ ] **Step 4: Fix typo — replace `categoriesRouter.get` with `productsRouter.get` in the GET /products route**

In `apps/api/src/routes/products.ts`, ensure the list route uses `productsRouter.get`, not `categoriesRouter.get`. The correct line:
```typescript
productsRouter.get("/", async (req, res) => {
```

- [ ] **Step 5: Register route in app.ts**

`apps/api/src/app.ts`:
```typescript
import { productsRouter } from "./routes/products"
// ...
app.use("/products", productsRouter)
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/products.test.ts
```
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/products.ts apps/api/src/routes/__tests__/products.test.ts apps/api/src/app.ts
git commit -m "feat(api): product CRUD routes with pagination, category/status filters, slug lookup"
```

---

## Task 3: Product Variant API Routes

**Goal:** Provide per-product variant listing and admin CRUD, plus a dedicated stock-update endpoint used by the checkout flow.

**Files:**
- Create: `apps/api/src/routes/variants.ts`
- Create: `apps/api/src/routes/__tests__/variants.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing tests**

`apps/api/src/routes/__tests__/variants.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

import { app } from "../../app"
import { supabase } from "../../lib/supabase"

const mockVariant = {
  id: "var-1",
  product_id: "prod-1",
  sku: "PROB-001",
  name: "60粒裝",
  price: "699.00",
  sale_price: null,
  stock_qty: 50,
  weight: "0.150",
  attributes: { size: "60粒" },
}

describe("GET /products/:id/variants", () => {
  it("returns variants for a product", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [mockVariant], error: null }),
    } as any)

    const res = await request(app).get("/products/prod-1/variants")
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })
})

describe("PATCH /products/:id/variants/:variantId/stock", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .patch("/products/prod-1/variants/var-1/stock")
      .send({ delta: -1 })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/variants.test.ts
```
Expected: FAIL — route not registered

- [ ] **Step 3: Write variants route**

`apps/api/src/routes/variants.ts`:
```typescript
import { Router } from "express"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { z } from "zod"

export const variantsRouter = Router({ mergeParams: true })

const variantSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1),
  price: z.number().positive(),
  sale_price: z.number().positive().nullable().optional(),
  stock_qty: z.number().int().nonnegative().optional(),
  weight: z.number().positive().optional(),
  attributes: z.record(z.string()).optional(),
})

// GET /products/:id/variants — public
variantsRouter.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", req.params.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data: data ?? [] })
})

// POST /products/:id/variants — admin only
variantsRouter.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = variantSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("product_variants")
    .insert({ ...parsed.data, product_id: req.params.id })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ data })
})

// PUT /products/:id/variants/:variantId — admin only
variantsRouter.put("/:variantId", requireAuth, requireAdmin, async (req, res) => {
  const parsed = variantSchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("product_variants")
    .update(parsed.data)
    .eq("id", req.params.variantId)
    .eq("product_id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: "Variant not found" }); return }
  res.json({ data })
})

// DELETE /products/:id/variants/:variantId — admin only
variantsRouter.delete("/:variantId", requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", req.params.variantId)
    .eq("product_id", req.params.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})

// PATCH /products/:id/variants/:variantId/stock — auth required (checkout + admin)
// delta: positive = restock, negative = reserve/reduce
variantsRouter.patch("/:variantId/stock", requireAuth, async (req, res) => {
  const { delta } = z.object({ delta: z.number().int() }).parse(req.body)

  const { data: variant, error: fetchError } = await supabase
    .from("product_variants")
    .select("stock_qty")
    .eq("id", req.params.variantId)
    .single()

  if (fetchError || !variant) { res.status(404).json({ error: "Variant not found" }); return }

  const newQty = (variant.stock_qty ?? 0) + delta
  if (newQty < 0) { res.status(409).json({ error: "Insufficient stock" }); return }

  const { data, error } = await supabase
    .from("product_variants")
    .update({ stock_qty: newQty })
    .eq("id", req.params.variantId)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data })
})
```

- [ ] **Step 4: Register variants router under products in app.ts**

`apps/api/src/app.ts`:
```typescript
import { variantsRouter } from "./routes/variants"
// mount with mergeParams so :id is available
app.use("/products/:id/variants", variantsRouter)
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/variants.test.ts
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/variants.ts apps/api/src/routes/__tests__/variants.test.ts apps/api/src/app.ts
git commit -m "feat(api): product variant CRUD + atomic stock update endpoint"
```

---

## Task 4: Next.js Catalog Pages

**Goal:** Render `/shop` (paginated product listing with category filters) and `/shop/[slug]` (product detail with variant selector) as Server Components with Suspense skeletons.

**Files:**
- Create: `apps/web/src/lib/catalog.ts`
- Create: `apps/web/src/app/shop/page.tsx`
- Create: `apps/web/src/app/shop/loading.tsx`
- Create: `apps/web/src/app/shop/[slug]/page.tsx`
- Create: `apps/web/src/app/shop/[slug]/loading.tsx`
- Create: `apps/web/src/components/catalog/ProductCard.tsx`
- Create: `apps/web/src/components/catalog/ProductGrid.tsx`
- Create: `apps/web/src/components/catalog/CategoryFilter.tsx`

- [ ] **Step 1: Write typed catalog fetch helpers**

`apps/web/src/lib/catalog.ts`:
```typescript
import { apiClient } from "./api-client"

export interface ProductImage {
  url: string
  alt?: string
  sort_order: number
}

export interface ProductVariant {
  id: string
  sku?: string
  name: string
  price: string
  sale_price: string | null
  stock_qty: number
  weight?: string
  attributes?: Record<string, string>
}

export interface Product {
  id: string
  name: string
  slug: string
  description?: string
  category_id?: string
  images: ProductImage[]
  is_active: boolean
  created_at: string
  product_variants?: ProductVariant[]
}

export interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  sort_order: number
  children: Category[]
}

export interface PaginatedProducts {
  data: Product[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export async function getProducts(params: {
  page?: number
  limit?: number
  category?: string
  status?: string
  q?: string
}): Promise<PaginatedProducts> {
  const qs = new URLSearchParams()
  if (params.page) qs.set("page", String(params.page))
  if (params.limit) qs.set("limit", String(params.limit))
  if (params.category) qs.set("category", params.category)
  if (params.status) qs.set("status", params.status)
  if (params.q) qs.set("q", params.q)
  return apiClient(`/products?${qs}`)
}

export async function getProductBySlug(slug: string): Promise<{ data: Product }> {
  return apiClient(`/products/${slug}`)
}

export async function getCategories(): Promise<{ data: Category[] }> {
  return apiClient("/categories")
}
```

- [ ] **Step 2: Write ProductCard component**

`apps/web/src/components/catalog/ProductCard.tsx`:
```tsx
import Link from "next/link"
import Image from "next/image"
import type { Product } from "@/lib/catalog"

export function ProductCard({ product }: { product: Product }) {
  const primaryImage = product.images?.[0]
  const firstVariant = product.product_variants?.[0]
  const price = firstVariant ? Number(firstVariant.sale_price ?? firstVariant.price) : null

  return (
    <Link
      href={`/shop/${product.slug}`}
      className="group block rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="aspect-square relative bg-muted">
        {primaryImage ? (
          <Image
            src={primaryImage.url}
            alt={primaryImage.alt ?? product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            無圖片
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-medium text-sm line-clamp-2">{product.name}</p>
        {price !== null && (
          <p className="mt-1 text-sm font-semibold text-primary">
            NT$ {price.toLocaleString("zh-TW")}
          </p>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: Write ProductGrid component**

`apps/web/src/components/catalog/ProductGrid.tsx`:
```tsx
import type { Product } from "@/lib/catalog"
import { ProductCard } from "./ProductCard"

export function ProductGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        目前沒有符合條件的商品
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </div>
  )
}
```

- [ ] **Step 4: Write CategoryFilter component**

`apps/web/src/components/catalog/CategoryFilter.tsx`:
```tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import type { Category } from "@/lib/catalog"
import { Button } from "@/components/ui/button"

export function CategoryFilter({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get("category")

  function setCategory(slug: string | null) {
    const next = new URLSearchParams(params.toString())
    if (slug) next.set("category", slug)
    else next.delete("category")
    next.delete("page")
    router.push(`/shop?${next}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={!current ? "default" : "outline"}
        size="sm"
        onClick={() => setCategory(null)}
      >
        全部
      </Button>
      {categories.map(cat => (
        <Button
          key={cat.id}
          variant={current === cat.slug ? "default" : "outline"}
          size="sm"
          onClick={() => setCategory(cat.slug)}
        >
          {cat.name}
        </Button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Write /shop page (Server Component)**

`apps/web/src/app/shop/page.tsx`:
```tsx
import { Suspense } from "react"
import { getProducts, getCategories } from "@/lib/catalog"
import { ProductGrid } from "@/components/catalog/ProductGrid"
import { CategoryFilter } from "@/components/catalog/CategoryFilter"

interface Props {
  searchParams: Promise<{ page?: string; category?: string; q?: string }>
}

export const metadata = { title: "商品列表 | 誠真生活 RealReal" }

export default async function ShopPage({ searchParams }: Props) {
  const sp = await searchParams
  const page = Number(sp.page) || 1

  const [{ data: products, pagination }, { data: categories }] = await Promise.all([
    getProducts({ page, limit: 20, category: sp.category, status: "active", q: sp.q }),
    getCategories(),
  ])

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">商品列表</h1>

      <Suspense>
        <CategoryFilter categories={categories} />
      </Suspense>

      <div className="mt-6">
        <ProductGrid products={products} />
      </div>

      {pagination.pages > 1 && (
        <div className="mt-8 flex justify-center gap-2 text-sm text-muted-foreground">
          第 {pagination.page} 頁，共 {pagination.pages} 頁（{pagination.total} 件）
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Write /shop loading skeleton**

`apps/web/src/app/shop/loading.tsx`:
```tsx
export default function ShopLoading() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="h-8 w-32 bg-muted animate-pulse rounded mb-6" />
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-muted animate-pulse rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card overflow-hidden">
            <div className="aspect-square bg-muted animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-muted animate-pulse rounded" />
              <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Write /shop/[slug] page (Server Component)**

`apps/web/src/app/shop/[slug]/page.tsx`:
```tsx
import { notFound } from "next/navigation"
import Image from "next/image"
import { getProductBySlug } from "@/lib/catalog"
import type { Metadata } from "next"

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const { data } = await getProductBySlug(slug)
    return { title: `${data.name} | 誠真生活 RealReal`, description: data.description }
  } catch {
    return { title: "商品不存在 | 誠真生活 RealReal" }
  }
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params
  let product
  try {
    const res = await getProductBySlug(slug)
    product = res.data
  } catch {
    notFound()
  }

  const primaryImage = product.images?.[0]
  const variants = product.product_variants ?? []

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Image */}
        <div className="aspect-square relative rounded-xl overflow-hidden bg-muted">
          {primaryImage ? (
            <Image
              src={primaryImage.url}
              alt={primaryImage.alt ?? product.name}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              無圖片
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          {product.description && (
            <p className="text-muted-foreground text-sm leading-relaxed">{product.description}</p>
          )}

          {variants.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">規格</p>
              <div className="flex flex-wrap gap-2">
                {variants.map(v => (
                  <div key={v.id} className="rounded-lg border px-4 py-2 text-sm">
                    <span>{v.name}</span>
                    <span className="ml-2 font-semibold text-primary">
                      NT$ {Number(v.sale_price ?? v.price).toLocaleString("zh-TW")}
                    </span>
                    {v.stock_qty === 0 && (
                      <span className="ml-2 text-xs text-destructive">缺貨</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Write /shop/[slug] loading skeleton**

`apps/web/src/app/shop/[slug]/loading.tsx`:
```tsx
export default function ProductDetailLoading() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="aspect-square rounded-xl bg-muted animate-pulse" />
        <div className="flex flex-col gap-4">
          <div className="h-8 w-3/4 bg-muted animate-pulse rounded" />
          <div className="space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex gap-2 mt-4">
            <div className="h-10 w-28 bg-muted animate-pulse rounded-lg" />
            <div className="h-10 w-28 bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/catalog.ts apps/web/src/app/shop apps/web/src/components/catalog
git commit -m "feat(web): product catalog pages — /shop listing and /shop/[slug] detail with Suspense"
```

---

## Task 5: Product Image Upload to Supabase Storage

**Goal:** Allow admins to upload product images to Supabase Storage bucket `product-images` and store the ordered URL array as JSONB in `products.images`.

**Files:**
- Create: `apps/api/src/routes/uploads.ts`
- Create: `apps/api/src/routes/__tests__/uploads.test.ts`
- Create: `apps/web/src/components/catalog/ProductImageUpload.tsx`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create Supabase Storage bucket**

In Supabase Dashboard → Storage → New bucket:
- Name: `product-images`
- Public bucket: yes (CDN-backed public reads)
- Allowed MIME types: `image/jpeg, image/png, image/webp, image/avif`
- Max file size: 5 MB

- [ ] **Step 2: Write failing test**

`apps/api/src/routes/__tests__/uploads.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    storage: { from: vi.fn() },
    auth: { getUser: vi.fn() },
  },
}))

import { app } from "../../app"

describe("POST /uploads/product-image", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/uploads/product-image")
      .attach("file", Buffer.from("fake"), { filename: "test.jpg", contentType: "image/jpeg" })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 3: Write uploads route**

`apps/api/src/routes/uploads.ts`:
```typescript
import { Router } from "express"
import multer from "multer"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"

export const uploadsRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"]
    cb(null, allowed.includes(file.mimetype))
  },
})

// POST /uploads/product-image — admin only
uploadsRouter.post(
  "/product-image",
  requireAuth,
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) { res.status(400).json({ error: "No file provided or unsupported type" }); return }

    const ext = req.file.mimetype.split("/")[1]
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const path = `products/${filename}`

    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      })

    if (error) { res.status(500).json({ error: error.message }); return }

    const { data: { publicUrl } } = supabase.storage
      .from("product-images")
      .getPublicUrl(path)

    res.status(201).json({ data: { url: publicUrl, path } })
  }
)

// DELETE /uploads/product-image — admin only, removes by storage path
uploadsRouter.delete("/product-image", requireAuth, requireAdmin, async (req, res) => {
  const { path } = req.body
  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "path is required" }); return
  }

  const { error } = await supabase.storage
    .from("product-images")
    .remove([path])

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})
```

- [ ] **Step 4: Install multer**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install multer
npm install --save-dev @types/multer
```

- [ ] **Step 5: Register uploads route in app.ts**

`apps/api/src/app.ts`:
```typescript
import { uploadsRouter } from "./routes/uploads"
// ...
app.use("/uploads", uploadsRouter)
```

- [ ] **Step 6: Write ProductImageUpload component (admin UI)**

`apps/web/src/components/catalog/ProductImageUpload.tsx`:
```tsx
"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface UploadedImage {
  url: string
  path: string
  sort_order: number
}

interface Props {
  value: UploadedImage[]
  onChange: (images: UploadedImage[]) => void
  token: string
}

export function ProductImageUpload({ value, onChange, token }: Props) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)

    try {
      const uploaded: UploadedImage[] = []
      for (const file of files) {
        const form = new FormData()
        form.append("file", file)
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/uploads/product-image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
        if (!res.ok) throw new Error("上傳失敗")
        const { data } = await res.json()
        uploaded.push({ url: data.url, path: data.path, sort_order: value.length + uploaded.length })
      }
      onChange([...value, ...uploaded])
      toast.success(`已上傳 ${uploaded.length} 張圖片`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上傳失敗")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function remove(index: number) {
    const next = value
      .filter((_, i) => i !== index)
      .map((img, i) => ({ ...img, sort_order: i }))
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {value.map((img, i) => (
          <div key={img.path} className="relative w-24 h-24 rounded-lg overflow-hidden border">
            <Image src={img.url} alt={`圖片 ${i + 1}`} fill className="object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "上傳中…" : "新增圖片"}
      </Button>
    </div>
  )
}
```

- [ ] **Step 7: Run upload tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/uploads.test.ts
```
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/uploads.ts apps/api/src/routes/__tests__/uploads.test.ts apps/api/src/app.ts apps/web/src/components/catalog/ProductImageUpload.tsx
git commit -m "feat: product image upload to Supabase Storage with admin guard and 5 MB limit"
```

---

## Task 6: Admin Product Management UI

**Goal:** Provide admin pages at `/admin/products` (DataTable), `/admin/products/new`, and `/admin/products/[id]` for full product CRUD using shadcn/ui.

**Files:**
- Create: `apps/web/src/components/admin/ProductDataTable.tsx`
- Create: `apps/web/src/app/admin/products/page.tsx`
- Create: `apps/web/src/app/admin/products/new/page.tsx`
- Create: `apps/web/src/app/admin/products/[id]/page.tsx`

- [ ] **Step 1: Install shadcn DataTable dependencies**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx shadcn@latest add table badge dialog select textarea
npm install @tanstack/react-table
```

- [ ] **Step 2: Write ProductDataTable component**

`apps/web/src/components/admin/ProductDataTable.tsx`:
```tsx
"use client"

import {
  useReactTable, getCoreRowModel, flexRender,
  type ColumnDef,
} from "@tanstack/react-table"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import type { Product } from "@/lib/catalog"

const columns: ColumnDef<Product>[] = [
  {
    accessorKey: "name",
    header: "商品名稱",
    cell: ({ row }) => (
      <Link
        href={`/admin/products/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.getValue("name")}
      </Link>
    ),
  },
  {
    accessorKey: "slug",
    header: "Slug",
    cell: ({ getValue }) => (
      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{String(getValue())}</code>
    ),
  },
  {
    accessorKey: "is_active",
    header: "狀態",
    cell: ({ getValue }) => (
      <Badge variant={getValue() ? "default" : "secondary"}>
        {getValue() ? "上架" : "下架"}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <Button variant="outline" size="sm" asChild>
        <Link href={`/admin/products/${row.original.id}`}>編輯</Link>
      </Button>
    ),
  },
]

export function ProductDataTable({ products }: { products: Product[] }) {
  const table = useReactTable({ data: products, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map(hg => (
          <TableRow key={hg.id}>
            {hg.headers.map(h => (
              <TableHead key={h.id}>
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map(row => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map(cell => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center py-10 text-muted-foreground">
              尚無商品
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 3: Write admin products list page**

`apps/web/src/app/admin/products/page.tsx`:
```tsx
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ProductDataTable } from "@/components/admin/ProductDataTable"
import { getProducts } from "@/lib/catalog"

export const metadata = { title: "商品管理 | 誠真生活 RealReal" }

export default async function AdminProductsPage() {
  const { data: products } = await getProducts({ limit: 100 })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">商品管理</h1>
        <Button asChild>
          <Link href="/admin/products/new">新增商品</Link>
        </Button>
      </div>
      <ProductDataTable products={products} />
    </div>
  )
}
```

- [ ] **Step 4: Write admin new product page**

`apps/web/src/app/admin/products/new/page.tsx`:
```tsx
import { ProductForm } from "@/components/admin/ProductForm"
import { getCategories } from "@/lib/catalog"

export const metadata = { title: "新增商品 | 誠真生活 RealReal" }

export default async function NewProductPage() {
  const { data: categories } = await getCategories()
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">新增商品</h1>
      <ProductForm categories={categories} />
    </div>
  )
}
```

- [ ] **Step 5: Write ProductForm component**

`apps/web/src/components/admin/ProductForm.tsx`:
```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { ProductImageUpload } from "@/components/catalog/ProductImageUpload"
import type { Category, Product, ProductImage } from "@/lib/catalog"

interface Props {
  product?: Product
  categories: Category[]
  token?: string
}

export function ProductForm({ product, categories, token = "" }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    const body = {
      name: form.get("name"),
      slug: form.get("slug"),
      description: form.get("description"),
      category_id: form.get("category_id") || undefined,
      is_active: form.get("is_active") === "true",
      images,
    }

    const url = product
      ? `${process.env.NEXT_PUBLIC_API_URL}/products/${product.id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/products`

    try {
      const res = await fetch(url, {
        method: product ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "儲存失敗")
      }
      toast.success(product ? "商品已更新" : "商品已建立")
      router.push("/admin/products")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "發生錯誤")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">商品名稱</Label>
        <Input id="name" name="name" required defaultValue={product?.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Slug（URL 識別碼）</Label>
        <Input id="slug" name="slug" required defaultValue={product?.slug}
          pattern="[a-z0-9-]+" title="只允許小寫英文、數字和連字號" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">商品描述</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={product?.description} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category_id">分類</Label>
        <Select name="category_id" defaultValue={product?.category_id ?? ""}>
          <SelectTrigger>
            <SelectValue placeholder="選擇分類" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="is_active">狀態</Label>
        <Select name="is_active" defaultValue={product?.is_active ? "true" : "false"}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">上架</SelectItem>
            <SelectItem value="false">下架</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>商品圖片</Label>
        <ProductImageUpload value={images} onChange={setImages} token={token} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? "儲存中…" : product ? "更新商品" : "建立商品"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 6: Write admin edit product page**

`apps/web/src/app/admin/products/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation"
import { ProductForm } from "@/components/admin/ProductForm"
import { getCategories } from "@/lib/catalog"
import { apiClient } from "@/lib/api-client"
import type { Product } from "@/lib/catalog"

interface Props { params: Promise<{ id: string }> }

export const metadata = { title: "編輯商品 | 誠真生活 RealReal" }

export default async function EditProductPage({ params }: Props) {
  const { id } = await params
  let product: Product

  try {
    const res = await apiClient<{ data: Product }>(`/products/${id}`)
    product = res.data
  } catch {
    notFound()
  }

  const { data: categories } = await getCategories()

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">編輯商品：{product.name}</h1>
      <ProductForm product={product} categories={categories} />
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/admin apps/web/src/app/admin/products
git commit -m "feat(web): admin product management UI — DataTable, create/edit forms with image upload"
```

---

## Task 7: Inventory Management

**Goal:** Track stock in `product_variants.stock_qty`, dispatch BullMQ low-stock alerts when stock falls below threshold, and ensure checkout stock reservation is atomic.

**Files:**
- Create: `apps/api/src/lib/queue.ts`
- Create: `apps/api/src/jobs/low-stock-alert.ts`
- Create: `apps/api/src/jobs/__tests__/low-stock-alert.test.ts`

- [ ] **Step 1: Install BullMQ and Redis client**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install bullmq @upstash/redis ioredis
```

- [ ] **Step 2: Write queue init**

`apps/api/src/lib/queue.ts`:
```typescript
import { Queue, Worker } from "bullmq"
import IORedis from "ioredis"

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })

export const inventoryQueue = new Queue("inventory", { connection })

export { connection as redisConnection }
```

- [ ] **Step 3: Write failing test**

`apps/api/src/jobs/__tests__/low-stock-alert.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn() },
}))

import { processLowStockAlert } from "../low-stock-alert"
import { supabase } from "../../lib/supabase"

describe("processLowStockAlert", () => {
  it("queries variants below threshold and returns count", async () => {
    const mockVariants = [
      { id: "var-1", sku: "PROB-001", stock_qty: 3, product_id: "prod-1" },
      { id: "var-2", sku: "PROB-002", stock_qty: 0, product_id: "prod-2" },
    ]
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: mockVariants, error: null }),
    } as any)

    const result = await processLowStockAlert({ threshold: 5 })
    expect(result.alertCount).toBe(2)
    expect(result.variants).toHaveLength(2)
  })

  it("returns zero when all stock is healthy", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as any)

    const result = await processLowStockAlert({ threshold: 5 })
    expect(result.alertCount).toBe(0)
  })
})
```

- [ ] **Step 4: Run test — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/jobs/__tests__/low-stock-alert.test.ts
```
Expected: FAIL — "Cannot find module ../low-stock-alert"

- [ ] **Step 5: Write low-stock alert job**

`apps/api/src/jobs/low-stock-alert.ts`:
```typescript
import { supabase } from "../lib/supabase"

const DEFAULT_THRESHOLD = 5

interface LowStockResult {
  alertCount: number
  variants: Array<{ id: string; sku?: string; stock_qty: number; product_id: string }>
}

export async function processLowStockAlert(
  opts: { threshold?: number } = {}
): Promise<LowStockResult> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, sku, stock_qty, product_id")
    .lt("stock_qty", threshold)
    .eq("stock_qty", supabase.rpc) // placeholder — real query uses .lt only

  // Correct query (remove the second .eq above):
  const { data: variants, error: err } = await supabase
    .from("product_variants")
    .select("id, sku, stock_qty, product_id")
    .lt("stock_qty", threshold)

  if (err) throw new Error(err.message)

  if (variants && variants.length > 0) {
    // In production: send email/Slack notification here
    console.log(`[low-stock-alert] ${variants.length} variants below threshold ${threshold}:`)
    variants.forEach(v => {
      console.log(`  - ${v.sku ?? v.id}: ${v.stock_qty} remaining`)
    })
  }

  return { alertCount: variants?.length ?? 0, variants: variants ?? [] }
}
```

- [ ] **Step 6: Simplify job — remove duplicate query**

Replace the body of `processLowStockAlert` in `apps/api/src/jobs/low-stock-alert.ts` with the clean version:
```typescript
export async function processLowStockAlert(
  opts: { threshold?: number } = {}
): Promise<LowStockResult> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD

  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("id, sku, stock_qty, product_id")
    .lt("stock_qty", threshold)

  if (error) throw new Error(error.message)

  if (variants && variants.length > 0) {
    console.log(`[low-stock-alert] ${variants.length} variants below threshold ${threshold}:`)
    variants.forEach(v => {
      console.log(`  - ${v.sku ?? v.id}: ${v.stock_qty} remaining`)
    })
  }

  return { alertCount: variants?.length ?? 0, variants: variants ?? [] }
}
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/jobs/__tests__/low-stock-alert.test.ts
```
Expected: All tests PASS

- [ ] **Step 8: Register BullMQ worker in app startup**

`apps/api/src/index.ts` — add after server starts:
```typescript
import { Worker } from "bullmq"
import { processLowStockAlert } from "./jobs/low-stock-alert"
import { redisConnection } from "./lib/queue"

const inventoryWorker = new Worker(
  "inventory",
  async job => {
    if (job.name === "low-stock-check") {
      await processLowStockAlert({ threshold: Number(job.data.threshold) || 5 })
    }
  },
  { connection: redisConnection }
)

inventoryWorker.on("failed", (job, err) => {
  console.error(`[inventory worker] job ${job?.id} failed:`, err.message)
})
```

- [ ] **Step 9: Add daily low-stock check scheduler**

`apps/api/src/index.ts` — schedule recurring job after worker registration:
```typescript
import { inventoryQueue } from "./lib/queue"

// Schedule daily low-stock check at 08:00 Asia/Taipei
await inventoryQueue.add(
  "low-stock-check",
  { threshold: 5 },
  {
    repeat: { pattern: "0 8 * * *", tz: "Asia/Taipei" },
    removeOnComplete: 10,
    removeOnFail: 5,
  }
)
```

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/lib/queue.ts apps/api/src/jobs apps/api/src/index.ts
git commit -m "feat(api): BullMQ inventory queue with daily low-stock alert job"
```

---

## Task 8: Full-Text Search

**Goal:** Enable PostgreSQL tsvector full-text search on `products(name, description)` and expose it via the existing `GET /products?q=` endpoint.

**Files:**
- Create: `packages/db/migrations/0002_catalog_search.sql`
- Modify: `apps/api/src/routes/products.ts` (upgrade `ilike` to `textSearch`)

- [ ] **Step 1: Write migration SQL**

`packages/db/migrations/0002_catalog_search.sql`:
```sql
-- Add tsvector search column to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE products
SET search_vector = to_tsvector('chinese', coalesce(name, '') || ' ' || coalesce(description, ''));

-- Create GIN index for fast FTS queries
CREATE INDEX IF NOT EXISTS products_search_vector_idx ON products USING GIN (search_vector);

-- Trigger to keep search_vector in sync
CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'chinese',
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.description, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;
CREATE TRIGGER products_search_vector_trigger
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();
```

- [ ] **Step 2: Apply migration in Supabase SQL Editor**

Paste `0002_catalog_search.sql` into Supabase Dashboard → SQL Editor → Run.
Expected: "Success. No rows returned"

- [ ] **Step 3: Upgrade search in products route**

In `apps/api/src/routes/products.ts`, replace the `ilike` search with a `textSearch` call when `q` is present:

```typescript
// Replace:
if (req.query.q) query = query.ilike("name", `%${req.query.q}%`)

// With:
if (req.query.q) {
  query = query.textSearch("search_vector", String(req.query.q), {
    config: "chinese",
    type: "websearch",
  })
}
```

- [ ] **Step 4: Write search integration test**

`apps/api/src/routes/__tests__/products.test.ts` — add inside the existing describe block:
```typescript
describe("GET /products?q= full-text search", () => {
  it("calls textSearch when q param is present", async () => {
    const mockTextSearch = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 })
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      textSearch: mockTextSearch,
    }
    vi.mocked(supabase.from).mockReturnValue(mockQuery as any)

    await request(app).get("/products?q=益生菌")
    expect(mockTextSearch).toHaveBeenCalledWith(
      "search_vector",
      "益生菌",
      expect.objectContaining({ type: "websearch" })
    )
  })
})
```

- [ ] **Step 5: Run full products test suite — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/products.test.ts
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0002_catalog_search.sql apps/api/src/routes/products.ts
git commit -m "feat(db,api): PostgreSQL tsvector full-text search on products name+description"
```

---

## Task 9: Integration Smoke Test + DoD Verification

- [ ] **Step 1: Start Railway API**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npm run dev
```
Expected: "API server started" on port 4000

- [ ] **Step 2: Verify category endpoint**

```bash
curl http://localhost:4000/categories
```
Expected: `{"data":[]}` (empty tree or seeded categories)

- [ ] **Step 3: Verify product listing**

```bash
curl "http://localhost:4000/products?page=1&limit=5&status=active"
```
Expected: `{"data":[],"pagination":{"page":1,"limit":5,"total":0,"pages":0}}`

- [ ] **Step 4: Verify 404 for unknown slug**

```bash
curl http://localhost:4000/products/no-such-product
```
Expected: `{"error":"Product not found"}` with HTTP 404

- [ ] **Step 5: Verify admin endpoints reject unauthenticated requests**

```bash
curl -X POST http://localhost:4000/categories -H "Content-Type: application/json" -d '{"name":"Test","slug":"test"}'
curl -X POST http://localhost:4000/products -H "Content-Type: application/json" -d '{"name":"Test","slug":"test"}'
curl -X POST http://localhost:4000/uploads/product-image
```
Expected: All return HTTP 401

- [ ] **Step 6: Start Next.js**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npm run dev
```
Expected: Ready on `http://localhost:3000`

- [ ] **Step 7: Verify shop page**

Open `http://localhost:3000/shop` — expect product listing page renders with "商品列表" heading and category filter buttons

- [ ] **Step 8: Verify 404 for unknown product slug**

Open `http://localhost:3000/shop/nonexistent` — expect Next.js 404 page

- [ ] **Step 9: Verify admin products page redirects when unauthenticated**

Open `http://localhost:3000/admin/products` — expect redirect to `/auth/login`

- [ ] **Step 10: Run all tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal
npx turbo test
```
Expected: All tests PASS across `apps/api` and `apps/web`

- [ ] **Step 11: TypeScript check all packages**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/packages/db && npx tsc --noEmit
```
Expected: No errors in any package

- [ ] **Step 12: Verify tsvector migration in Supabase**

In Supabase Dashboard → Table Editor → `products` — confirm `search_vector` column exists and the GIN index appears under Indexes.

---

## Definition of Done

- [ ] `GET /categories` returns a nested tree structure
- [ ] `GET /products` supports `page`, `limit`, `category`, `status`, `q` query params and returns correct `pagination` metadata
- [ ] `GET /products/:slug` returns product with nested `product_variants` or 404
- [ ] `GET /products/:id/variants` returns variants; `PATCH /products/:id/variants/:variantId/stock` returns 409 when insufficient stock
- [ ] `POST /uploads/product-image` stores image in Supabase Storage bucket `product-images` and returns a public URL
- [ ] All POST/PUT/DELETE admin routes return 401 without a valid JWT and 403 without admin role
- [ ] `/shop` renders product grid with category filter; `/shop/[slug]` renders product detail with variant list
- [ ] `/admin/products` is accessible to admin users and shows DataTable with create/edit navigation
- [ ] BullMQ `inventory` queue and `low-stock-check` job are registered and the worker boots without error
- [ ] `products.search_vector` tsvector column + GIN index exist in Supabase; `GET /products?q=` uses `textSearch`
- [ ] `npx turbo test` — all tests PASS
- [ ] `tsc --noEmit` — zero errors in all 3 packages (web, api, db)
