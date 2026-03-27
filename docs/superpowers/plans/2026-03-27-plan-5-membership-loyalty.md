# Plan 5: Membership & Loyalty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full membership tier lifecycle — automatic tier upgrades after orders, discount application at checkout, coupon issuance and validation, admin coupon management, member-facing account pages, guest upsell badges, referral code scaffolding, and admin analytics — so 誠真生活 RealReal's loyalty programme is fully operational.

**Architecture:** Tier upgrade logic runs as a BullMQ job on the Railway API after payment confirmation. Discount middleware runs server-side in the Express checkout route. Coupons are validated via a dedicated API route and recorded atomically. The Next.js frontend uses React Server Components for the membership page and client components where interactivity is required.

**Tech Stack:** Next.js 15 App Router, TypeScript, Express 5, BullMQ, Drizzle ORM, Supabase PostgreSQL, shadcn/ui, Tailwind CSS, Geist font, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-realreal-rewrite-design.md`

**Dependencies:** Plan 1 (Foundation) must be complete before starting this plan.

---

## Membership Tiers (already seeded — reference only)

| Tier | min_spend (NTD) | discount_rate |
|------|-----------------|---------------|
| 一般會員 | 0 | 0% |
| 銀卡會員 | 3,000 | 3% |
| 金卡會員 | 10,000 | 5% |
| 鑽石會員 | 30,000 | 8% |

---

## File Map

```
realreal/
├── packages/db/src/schema/
│   └── membership.ts                          # coupons, coupon_uses, referral_codes (extensions)
├── apps/api/src/
│   ├── jobs/
│   │   ├── tier-upgrade.job.ts                # BullMQ worker: update total_spend + tier
│   │   └── referral-reward.job.ts             # BullMQ worker: issue referrer coupon (optional)
│   ├── routes/
│   │   ├── coupons.ts                         # POST /api/coupons/validate
│   │   ├── admin/
│   │   │   ├── coupons.ts                     # CRUD + bulk generate
│   │   │   └── membership-analytics.ts        # spend by tier, distribution, top customers
│   │   └── membership.ts                      # GET /api/membership/me
│   ├── middleware/
│   │   └── discount.ts                        # applyMemberDiscount — attach to checkout route
│   └── lib/
│       ├── tier.ts                            # tier upgrade logic (pure, testable)
│       └── coupon.ts                          # coupon validation logic (pure, testable)
└── apps/web/src/app/
    ├── my-account/
    │   └── membership/
    │       └── page.tsx                       # Tier dashboard, progress bar, benefits
    ├── (shop)/
    │   └── products/
    │       └── [slug]/
    │           └── _components/
    │               └── MemberPriceBadge.tsx   # Member price + guest upsell badge
    └── (checkout)/
        └── cart/
            └── _components/
                └── MemberDiscountLine.tsx     # Discount line in cart summary
```

---

## Task 1: Membership Tier Upgrade Job (BullMQ)

**Files:**
- Create: `apps/api/src/lib/tier.ts`
- Create: `apps/api/src/jobs/tier-upgrade.job.ts`
- Create: `apps/api/src/jobs/__tests__/tier-upgrade.test.ts`

- [ ] **Step 1: Write tier upgrade logic unit tests**

`apps/api/src/jobs/__tests__/tier-upgrade.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { computeNewTier, TIERS } from "../../lib/tier"

describe("computeNewTier", () => {
  it("stays at 一般會員 below 3000", () => {
    expect(computeNewTier(2999)).toBe(TIERS[0].id)
  })

  it("upgrades to 銀卡會員 at exactly 3000", () => {
    expect(computeNewTier(3000)).toBe(TIERS[1].id)
  })

  it("upgrades to 金卡會員 at exactly 10000", () => {
    expect(computeNewTier(10000)).toBe(TIERS[2].id)
  })

  it("upgrades to 鑽石會員 at exactly 30000", () => {
    expect(computeNewTier(30000)).toBe(TIERS[3].id)
  })

  it("stays at 鑽石會員 above 30000", () => {
    expect(computeNewTier(99999)).toBe(TIERS[3].id)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/jobs/__tests__/tier-upgrade.test.ts
```
Expected: FAIL — "Cannot find module ../../lib/tier"

- [ ] **Step 3: Write tier logic**

`apps/api/src/lib/tier.ts`:
```typescript
// Tiers ordered by ascending min_spend.
// IDs must match the UUIDs seeded in membership_tiers.
// At runtime, load them from DB once and cache; for unit tests, use these stubs.

export const TIERS = [
  { id: "tier-general",  name: "一般會員", minSpend: 0,     discountRate: 0    },
  { id: "tier-silver",   name: "銀卡會員", minSpend: 3000,  discountRate: 0.03 },
  { id: "tier-gold",     name: "金卡會員", minSpend: 10000, discountRate: 0.05 },
  { id: "tier-diamond",  name: "鑽石會員", minSpend: 30000, discountRate: 0.08 },
] as const

export type TierRow = (typeof TIERS)[number]

/**
 * Returns the ID of the highest tier the user qualifies for given their
 * cumulative total_spend (in NTD, integer cents or whole numbers).
 */
export function computeNewTier(totalSpend: number): string {
  let result: TierRow = TIERS[0]
  for (const tier of TIERS) {
    if (totalSpend >= tier.minSpend) result = tier
  }
  return result.id
}

/**
 * Returns the discount rate (0–1) for a given tier ID.
 */
export function getDiscountRate(tierId: string): number {
  return TIERS.find((t) => t.id === tierId)?.discountRate ?? 0
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/jobs/__tests__/tier-upgrade.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Write BullMQ worker**

`apps/api/src/jobs/tier-upgrade.job.ts`:
```typescript
import { Worker, Queue } from "bullmq"
import { redis } from "../lib/redis"
import { supabase } from "../lib/supabase"
import { computeNewTier } from "../lib/tier"

export const tierUpgradeQueue = new Queue("tier-upgrade", { connection: redis })

export const tierUpgradeWorker = new Worker(
  "tier-upgrade",
  async (job) => {
    const { userId, orderAmount } = job.data as { userId: string; orderAmount: number }

    // 1. Increment total_spend atomically in DB
    const { data: profile, error: fetchErr } = await supabase
      .from("user_profiles")
      .select("total_spend, membership_tier_id")
      .eq("id", userId)
      .single()

    if (fetchErr || !profile) throw new Error(`Profile not found for user ${userId}`)

    const newTotalSpend = Number(profile.total_spend ?? 0) + orderAmount
    const newTierId = computeNewTier(newTotalSpend)

    const updateData: Record<string, unknown> = { total_spend: newTotalSpend }
    if (newTierId !== profile.membership_tier_id) {
      updateData.membership_tier_id = newTierId
    }

    const { error: updateErr } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("id", userId)

    if (updateErr) throw updateErr

    return { userId, newTotalSpend, newTierId }
  },
  { connection: redis }
)
```

- [ ] **Step 6: Enqueue job from payment webhook (integration point)**

In the existing payment webhook handler (added in a later plan), add after marking payment as `paid`:

```typescript
import { tierUpgradeQueue } from "../jobs/tier-upgrade.job"

// After payment confirmed:
await tierUpgradeQueue.add("upgrade", {
  userId: order.userId,
  orderAmount: Number(order.total),
})
```

- [ ] **Step 7: Commit**

```bash
cd /Users/cataholic/Desktop/airport/realreal
git add apps/api/src/lib/tier.ts apps/api/src/jobs/tier-upgrade.job.ts apps/api/src/jobs/__tests__/tier-upgrade.test.ts
git commit -m "feat(api): BullMQ tier-upgrade job — update total_spend and membership tier after order"
```

---

## Task 2: Discount Application Middleware

**Files:**
- Create: `apps/api/src/middleware/discount.ts`
- Create: `apps/api/src/middleware/__tests__/discount.test.ts`

- [ ] **Step 1: Write discount middleware tests**

`apps/api/src/middleware/__tests__/discount.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response, NextFunction } from "express"

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from "../../lib/supabase"
import { applyMemberDiscount } from "../discount"

function makeReqRes(overrides?: Partial<Request>) {
  const req = { body: { subtotal: 1000 }, ...overrides } as unknown as Request
  const res = {
    locals: { userId: undefined as string | undefined },
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
  const next = vi.fn() as NextFunction
  return { req, res, next }
}

describe("applyMemberDiscount", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sets discount to 0 for unauthenticated users", async () => {
    const { req, res, next } = makeReqRes()
    await applyMemberDiscount(req, res, next)
    expect(req.body.discountRate).toBe(0)
    expect(req.body.discountAmount).toBe(0)
    expect(next).toHaveBeenCalled()
  })

  it("applies 3% discount for 銀卡會員", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { membership_tier_id: "tier-silver" },
      }),
    } as any)

    const { req, res, next } = makeReqRes()
    ;(res as any).locals.userId = "user-123"
    req.body.subtotal = 10000

    await applyMemberDiscount(req, res, next)
    expect(req.body.discountRate).toBe(0.03)
    expect(req.body.discountAmount).toBe(300)
    expect(next).toHaveBeenCalled()
  })

  it("applies 8% discount for 鑽石會員", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { membership_tier_id: "tier-diamond" },
      }),
    } as any)

    const { req, res, next } = makeReqRes()
    ;(res as any).locals.userId = "vip-user"
    req.body.subtotal = 5000

    await applyMemberDiscount(req, res, next)
    expect(req.body.discountRate).toBe(0.08)
    expect(req.body.discountAmount).toBe(400)
    expect(next).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/middleware/__tests__/discount.test.ts
```
Expected: FAIL — "Cannot find module ../discount"

- [ ] **Step 3: Write discount middleware**

`apps/api/src/middleware/discount.ts`:
```typescript
import type { Request, Response, NextFunction } from "express"
import { supabase } from "../lib/supabase"
import { getDiscountRate } from "../lib/tier"

/**
 * Express middleware — reads user's membership_tier_id from DB,
 * attaches discountRate and discountAmount to req.body.
 * Must run after requireAuth (or be skipped gracefully for guests).
 */
export async function applyMemberDiscount(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId: string | undefined = (res as any).locals.userId

  if (!userId) {
    req.body.discountRate = 0
    req.body.discountAmount = 0
    return next()
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("membership_tier_id")
    .eq("id", userId)
    .single()

  const tierId: string = profile?.membership_tier_id ?? "tier-general"
  const discountRate = getDiscountRate(tierId)
  const subtotal = Number(req.body.subtotal ?? 0)

  req.body.discountRate = discountRate
  req.body.discountAmount = Math.round(subtotal * discountRate)

  next()
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/middleware/__tests__/discount.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Store discount on orders table (migration)**

`packages/db/migrations/0005_membership_discount_columns.sql`:
```sql
-- Add membership discount tracking to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_rate   NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cataholic/Desktop/airport/realreal
git add apps/api/src/middleware/discount.ts apps/api/src/middleware/__tests__/discount.test.ts packages/db/migrations/0005_membership_discount_columns.sql
git commit -m "feat(api): member discount middleware — applies tier discount_rate to checkout subtotal"
```

---

## Task 3: Coupon System — Validate & Apply

**Files:**
- Create: `apps/api/src/lib/coupon.ts`
- Create: `apps/api/src/lib/__tests__/coupon.test.ts`
- Create: `apps/api/src/routes/coupons.ts`

- [ ] **Step 1: Write coupon validation unit tests**

`apps/api/src/lib/__tests__/coupon.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { applyCouponDiscount } from "../coupon"

const baseCoupon = {
  id: "coupon-1",
  code: "VEGAN10",
  type: "percentage" as const,
  value: 10,
  minOrder: 500,
  maxUses: 100,
  usedCount: 0,
  expiresAt: null,
  applicableTo: "order" as const,
}

describe("applyCouponDiscount", () => {
  it("applies 10% off on 1000 subtotal", () => {
    const result = applyCouponDiscount(baseCoupon, 1000)
    expect(result.discountAmount).toBe(100)
  })

  it("applies fixed 200 off", () => {
    const fixed = { ...baseCoupon, type: "fixed" as const, value: 200 }
    const result = applyCouponDiscount(fixed, 1000)
    expect(result.discountAmount).toBe(200)
  })

  it("rejects when subtotal below minOrder", () => {
    expect(() => applyCouponDiscount(baseCoupon, 400)).toThrow("最低消費")
  })

  it("rejects when coupon is expired", () => {
    const expired = { ...baseCoupon, expiresAt: new Date("2020-01-01") }
    expect(() => applyCouponDiscount(expired, 1000)).toThrow("已過期")
  })

  it("rejects when maxUses reached", () => {
    const exhausted = { ...baseCoupon, maxUses: 5, usedCount: 5 }
    expect(() => applyCouponDiscount(exhausted, 1000)).toThrow("已達使用上限")
  })

  it("fixed discount never exceeds subtotal", () => {
    const big = { ...baseCoupon, type: "fixed" as const, value: 9999, minOrder: 0 }
    const result = applyCouponDiscount(big, 500)
    expect(result.discountAmount).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/lib/__tests__/coupon.test.ts
```
Expected: FAIL — "Cannot find module ../coupon"

- [ ] **Step 3: Write coupon library**

`apps/api/src/lib/coupon.ts`:
```typescript
export type CouponType = "percentage" | "fixed"
export type ApplicableTo = "order" | "subscription" | "both"

export interface CouponRecord {
  id: string
  code: string
  type: CouponType
  value: number
  minOrder: number | null
  maxUses: number | null
  usedCount: number
  expiresAt: Date | null
  applicableTo: ApplicableTo
}

export interface CouponApplication {
  couponId: string
  discountAmount: number
}

/**
 * Pure function — validates coupon rules against the current subtotal
 * and returns the discount amount.  Throws with a user-facing message on failure.
 */
export function applyCouponDiscount(coupon: CouponRecord, subtotal: number): CouponApplication {
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new Error("優惠碼已過期")
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new Error("優惠碼已達使用上限")
  }
  if (coupon.minOrder !== null && subtotal < coupon.minOrder) {
    throw new Error(`此優惠碼最低消費為 NT$${coupon.minOrder}`)
  }

  let discountAmount = 0
  if (coupon.type === "percentage") {
    discountAmount = Math.round(subtotal * (coupon.value / 100))
  } else {
    discountAmount = Math.min(coupon.value, subtotal)
  }

  return { couponId: coupon.id, discountAmount }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/lib/__tests__/coupon.test.ts
```
Expected: PASS (6 tests)

- [ ] **Step 5: Write coupon validate route**

`apps/api/src/routes/coupons.ts`:
```typescript
import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { applyCouponDiscount } from "../lib/coupon"
import { requireAuth } from "../middleware/auth"

const router = Router()

const ValidateSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().positive(),
  context: z.enum(["order", "subscription"]).default("order"),
})

// POST /api/coupons/validate
router.post("/validate", requireAuth, async (req, res) => {
  const parsed = ValidateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { code, subtotal, context } = parsed.data
  const userId: string = (res as any).locals.userId

  // Fetch coupon
  const { data: coupon, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("code", code.toUpperCase())
    .single()

  if (error || !coupon) {
    res.status(404).json({ error: "優惠碼不存在" })
    return
  }

  // Check applicableTo
  if (coupon.applicable_to !== "both" && coupon.applicable_to !== context) {
    res.status(422).json({ error: "此優惠碼不適用於此情境" })
    return
  }

  // Check if user already used this coupon
  const { count } = await supabase
    .from("coupon_uses")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", coupon.id)
    .eq("user_id", userId)

  if ((count ?? 0) > 0) {
    res.status(422).json({ error: "您已使用過此優惠碼" })
    return
  }

  try {
    const application = applyCouponDiscount(
      {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value),
        minOrder: coupon.min_order ? Number(coupon.min_order) : null,
        maxUses: coupon.max_uses ?? null,
        usedCount: coupon.used_count ?? 0,
        expiresAt: coupon.expires_at ? new Date(coupon.expires_at) : null,
        applicableTo: coupon.applicable_to,
      },
      subtotal
    )
    res.json({ valid: true, ...application })
  } catch (err: any) {
    res.status(422).json({ valid: false, error: err.message })
  }
})

export default router
```

- [ ] **Step 6: Register coupon route in app.ts**

In `apps/api/src/app.ts`, add:
```typescript
import couponRoutes from "./routes/coupons"
// ...
app.use("/api/coupons", couponRoutes)
```

- [ ] **Step 7: Create coupon_uses on order placement (integration point)**

After an order is created with a coupon applied, call:
```typescript
await supabase.from("coupon_uses").insert({
  coupon_id: couponId,
  user_id: userId,
  order_id: orderId,
})

await supabase.rpc("increment_coupon_used_count", { p_coupon_id: couponId })
```

Add the RPC to the migration:
```sql
CREATE OR REPLACE FUNCTION increment_coupon_used_count(p_coupon_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE coupons SET used_count = used_count + 1 WHERE id = p_coupon_id;
END;
$$;
```

- [ ] **Step 8: Commit**

```bash
cd /Users/cataholic/Desktop/airport/realreal
git add apps/api/src/lib/coupon.ts apps/api/src/lib/__tests__/coupon.test.ts apps/api/src/routes/coupons.ts
git commit -m "feat(api): coupon validate route — percentage/fixed types, min_order, expiry, per-user dedup"
```

---

## Task 4: Admin Coupon Management

**Files:**
- Create: `apps/api/src/routes/admin/coupons.ts`
- Create: `apps/web/src/app/admin/coupons/page.tsx`
- Create: `apps/web/src/app/admin/coupons/_components/CouponForm.tsx`
- Create: `apps/web/src/app/admin/coupons/_components/CouponTable.tsx`

- [ ] **Step 1: Write admin coupon API routes**

`apps/api/src/routes/admin/coupons.ts`:
```typescript
import { Router } from "express"
import { z } from "zod"
import { nanoid } from "nanoid"
import { supabase } from "../../lib/supabase"
import { requireAuth } from "../../middleware/auth"
import { requireAdmin } from "../../middleware/admin"

const router = Router()
router.use(requireAuth, requireAdmin)

const CouponSchema = z.object({
  code: z.string().min(1).max(32).optional(),          // auto-generated if omitted
  type: z.enum(["percentage", "fixed"]),
  value: z.number().positive(),
  minOrder: z.number().nonnegative().optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  applicableTo: z.enum(["order", "subscription", "both"]).default("order"),
})

const BulkGenerateSchema = z.object({
  count: z.number().int().min(1).max(1000),
  prefix: z.string().max(8).optional(),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().positive(),
  minOrder: z.number().nonnegative().optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  applicableTo: z.enum(["order", "subscription", "both"]).default("order"),
})

// GET /api/admin/coupons
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// POST /api/admin/coupons
router.post("/", async (req, res) => {
  const parsed = CouponSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const d = parsed.data
  const code = (d.code ?? nanoid(8)).toUpperCase()

  const { data, error } = await supabase.from("coupons").insert({
    code,
    type: d.type,
    value: d.value,
    min_order: d.minOrder ?? null,
    max_uses: d.maxUses ?? null,
    expires_at: d.expiresAt ?? null,
    applicable_to: d.applicableTo,
  }).select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json(data)
})

// PUT /api/admin/coupons/:id
router.put("/:id", async (req, res) => {
  const parsed = CouponSchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const d = parsed.data
  const { data, error } = await supabase
    .from("coupons")
    .update({
      ...(d.type        !== undefined && { type: d.type }),
      ...(d.value       !== undefined && { value: d.value }),
      ...(d.minOrder    !== undefined && { min_order: d.minOrder }),
      ...(d.maxUses     !== undefined && { max_uses: d.maxUses }),
      ...(d.expiresAt   !== undefined && { expires_at: d.expiresAt }),
      ...(d.applicableTo !== undefined && { applicable_to: d.applicableTo }),
    })
    .eq("id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// DELETE /api/admin/coupons/:id
router.delete("/:id", async (req, res) => {
  const { error } = await supabase.from("coupons").delete().eq("id", req.params.id)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})

// POST /api/admin/coupons/bulk-generate
router.post("/bulk-generate", async (req, res) => {
  const parsed = BulkGenerateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const d = parsed.data
  const prefix = (d.prefix ?? "").toUpperCase()
  const rows = Array.from({ length: d.count }, () => ({
    code: `${prefix}${nanoid(8).toUpperCase()}`,
    type: d.type,
    value: d.value,
    min_order: d.minOrder ?? null,
    max_uses: d.maxUses ?? null,
    expires_at: d.expiresAt ?? null,
    applicable_to: d.applicableTo,
  }))

  const { data, error } = await supabase.from("coupons").insert(rows).select("code")
  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ generated: data?.length ?? 0, codes: data?.map((r) => r.code) })
})

export default router
```

- [ ] **Step 2: Register admin coupon route**

In `apps/api/src/app.ts`, add:
```typescript
import adminCouponRoutes from "./routes/admin/coupons"
// ...
app.use("/api/admin/coupons", adminCouponRoutes)
```

- [ ] **Step 3: Write admin coupons page (Next.js)**

`apps/web/src/app/admin/coupons/page.tsx`:
```typescript
import { createServerClient } from "@/lib/supabase/server"
import { CouponTable } from "./_components/CouponTable"
import { CouponForm } from "./_components/CouponForm"

export default async function AdminCouponsPage() {
  const supabase = await createServerClient()
  const { data: coupons } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">優惠碼管理</h1>
        <CouponForm />
      </div>
      <CouponTable coupons={coupons ?? []} />
    </div>
  )
}
```

- [ ] **Step 4: Write CouponForm component**

`apps/web/src/app/admin/coupons/_components/CouponForm.tsx`:
```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function CouponForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const payload = {
      code: fd.get("code") as string || undefined,
      type: fd.get("type") as string,
      value: Number(fd.get("value")),
      minOrder: fd.get("minOrder") ? Number(fd.get("minOrder")) : undefined,
      maxUses: fd.get("maxUses") ? Number(fd.get("maxUses")) : undefined,
      expiresAt: fd.get("expiresAt") ? new Date(fd.get("expiresAt") as string).toISOString() : undefined,
      applicableTo: fd.get("applicableTo") as string,
    }

    await fetch(`${process.env.NEXT_PUBLIC_RAILWAY_API_URL}/api/admin/coupons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    })

    setLoading(false)
    setOpen(false)
    window.location.reload()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>新增優惠碼</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增優惠碼</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">優惠碼（留空自動生成）</Label>
            <Input id="code" name="code" placeholder="VEGAN10" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">類型</Label>
              <Select name="type" defaultValue="percentage">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">百分比折扣</SelectItem>
                  <SelectItem value="fixed">固定折扣</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">折扣值</Label>
              <Input id="value" name="value" type="number" min={1} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minOrder">最低消費（NT$）</Label>
              <Input id="minOrder" name="minOrder" type="number" min={0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxUses">使用上限</Label>
              <Input id="maxUses" name="maxUses" type="number" min={1} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresAt">到期日</Label>
            <Input id="expiresAt" name="expiresAt" type="datetime-local" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="applicableTo">適用範圍</Label>
            <Select name="applicableTo" defaultValue="order">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="order">一次性訂單</SelectItem>
                <SelectItem value="subscription">訂閱</SelectItem>
                <SelectItem value="both">全部</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "建立中…" : "建立優惠碼"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Write CouponTable component**

`apps/web/src/app/admin/coupons/_components/CouponTable.tsx`:
```typescript
"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface Coupon {
  id: string
  code: string
  type: "percentage" | "fixed"
  value: string
  min_order: string | null
  max_uses: number | null
  used_count: number
  expires_at: string | null
  applicable_to: string
}

export function CouponTable({ coupons }: { coupons: Coupon[] }) {
  async function handleDelete(id: string) {
    if (!confirm("確定刪除此優惠碼？")) return
    await fetch(`${process.env.NEXT_PUBLIC_RAILWAY_API_URL}/api/admin/coupons/${id}`, {
      method: "DELETE",
      credentials: "include",
    })
    window.location.reload()
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>代碼</TableHead>
          <TableHead>類型</TableHead>
          <TableHead>折扣</TableHead>
          <TableHead>已使用 / 上限</TableHead>
          <TableHead>到期日</TableHead>
          <TableHead>範圍</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coupons.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-mono font-semibold">{c.code}</TableCell>
            <TableCell>
              <Badge variant="outline">
                {c.type === "percentage" ? "百分比" : "固定"}
              </Badge>
            </TableCell>
            <TableCell>
              {c.type === "percentage" ? `${c.value}%` : `NT$${c.value}`}
            </TableCell>
            <TableCell>
              {c.used_count} / {c.max_uses ?? "∞"}
            </TableCell>
            <TableCell>
              {c.expires_at
                ? new Date(c.expires_at).toLocaleDateString("zh-TW")
                : "永不到期"}
            </TableCell>
            <TableCell>{c.applicable_to}</TableCell>
            <TableCell>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(c.id)}
              >
                刪除
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/cataholic/Desktop/airport/realreal
git add apps/api/src/routes/admin/coupons.ts apps/web/src/app/admin/coupons/
git commit -m "feat(admin): coupon CRUD + bulk generate — percentage/fixed types, expiry, applicableTo"
```

---

## Task 5: My Account — Membership Page

**Files:**
- Create: `apps/web/src/app/my-account/membership/page.tsx`
- Create: `apps/web/src/app/my-account/membership/_components/TierProgressBar.tsx`
- Create: `apps/web/src/app/my-account/membership/_components/TierBenefitsList.tsx`

- [ ] **Step 1: Write TierProgressBar component**

`apps/web/src/app/my-account/membership/_components/TierProgressBar.tsx`:
```typescript
interface TierProgressBarProps {
  currentSpend: number
  currentTierName: string
  nextTierName: string | null
  nextTierMinSpend: number | null
}

export function TierProgressBar({
  currentSpend,
  currentTierName,
  nextTierName,
  nextTierMinSpend,
}: TierProgressBarProps) {
  if (!nextTierName || nextTierMinSpend === null) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">您已達到最高等級 🎉</p>
        <div className="h-2 w-full rounded-full bg-primary" />
      </div>
    )
  }

  const progress = Math.min((currentSpend / nextTierMinSpend) * 100, 100)
  const remaining = nextTierMinSpend - currentSpend

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{currentTierName}</span>
        <span className="font-medium">{nextTierName}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        再消費 NT${remaining.toLocaleString()} 即可升級至 {nextTierName}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Write TierBenefitsList component**

`apps/web/src/app/my-account/membership/_components/TierBenefitsList.tsx`:
```typescript
const TIER_BENEFITS: Record<string, string[]> = {
  "一般會員": ["免費建立帳號", "訂單歷史查詢", "會員專屬電子報"],
  "銀卡會員": ["消費 9.7 折", "優先客服回覆", "生日優惠碼"],
  "金卡會員": ["消費 9.5 折", "優先客服回覆", "生日雙倍優惠碼", "新品搶先試用"],
  "鑽石會員": ["消費 9.2 折", "專屬客服經理", "生日三倍優惠碼", "新品搶先試用", "免費升級訂閱"],
}

export function TierBenefitsList({ tierName }: { tierName: string }) {
  const benefits = TIER_BENEFITS[tierName] ?? []
  return (
    <ul className="space-y-1">
      {benefits.map((b) => (
        <li key={b} className="flex items-center gap-2 text-sm">
          <span className="text-green-600">✓</span>
          {b}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Write membership page**

`apps/web/src/app/my-account/membership/page.tsx`:
```typescript
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TierProgressBar } from "./_components/TierProgressBar"
import { TierBenefitsList } from "./_components/TierBenefitsList"

const TIER_ORDER = [
  { name: "一般會員", minSpend: 0,     discountRate: 0    },
  { name: "銀卡會員", minSpend: 3000,  discountRate: 0.03 },
  { name: "金卡會員", minSpend: 10000, discountRate: 0.05 },
  { name: "鑽石會員", minSpend: 30000, discountRate: 0.08 },
]

export default async function MembershipPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("total_spend, membership_tier_id, membership_tiers(name, discount_rate)")
    .eq("id", user.id)
    .single()

  const tierName: string = (profile?.membership_tiers as any)?.name ?? "一般會員"
  const discountRate: number = Number((profile?.membership_tiers as any)?.discount_rate ?? 0)
  const totalSpend = Number(profile?.total_spend ?? 0)

  const currentIndex = TIER_ORDER.findIndex((t) => t.name === tierName)
  const nextTier = currentIndex < TIER_ORDER.length - 1 ? TIER_ORDER[currentIndex + 1] : null

  const discountLabel = discountRate > 0
    ? `${((1 - discountRate) * 10).toFixed(1)} 折`
    : "無折扣"

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">我的會員等級</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{tierName}</CardTitle>
          <Badge variant="secondary" className="text-base px-3 py-1">
            {discountLabel}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            累積消費：NT${totalSpend.toLocaleString()}
          </p>
          <TierProgressBar
            currentSpend={totalSpend}
            currentTierName={tierName}
            nextTierName={nextTier?.name ?? null}
            nextTierMinSpend={nextTier?.minSpend ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">會員專屬權益</CardTitle>
        </CardHeader>
        <CardContent>
          <TierBenefitsList tierName={tierName} />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cataholic/Desktop/airport/realreal
git add apps/web/src/app/my-account/membership/
git commit -m "feat(web): membership page — tier badge, progress bar, cumulative spend, benefits list"
```

---

## Task 6: Member Price Display in Product & Cart

**Files:**
- Create: `apps/web/src/app/(shop)/products/[slug]/_components/MemberPriceBadge.tsx`
- Create: `apps/web/src/app/(checkout)/cart/_components/MemberDiscountLine.tsx`

- [ ] **Step 1: Write MemberPriceBadge**

`apps/web/src/app/(shop)/products/[slug]/_components/MemberPriceBadge.tsx`:
```typescript
import { createServerClient } from "@/lib/supabase/server"

interface MemberPriceBadgeProps {
  basePrice: number
}

const TIER_DISCOUNTS = [
  { name: "鑽石會員", rate: 0.08 },
  { name: "金卡會員", rate: 0.05 },
  { name: "銀卡會員", rate: 0.03 },
]

export async function MemberPriceBadge({ basePrice }: MemberPriceBadgeProps) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("membership_tiers(name, discount_rate)")
      .eq("id", user.id)
      .single()

    const tierName: string = (profile?.membership_tiers as any)?.name ?? "一般會員"
    const discountRate: number = Number((profile?.membership_tiers as any)?.discount_rate ?? 0)

    if (discountRate > 0) {
      const memberPrice = Math.round(basePrice * (1 - discountRate))
      const label = `${((1 - discountRate) * 10).toFixed(1)} 折`
      return (
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">NT${memberPrice.toLocaleString()}</span>
          <span className="text-sm line-through text-muted-foreground">
            NT${basePrice.toLocaleString()}
          </span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {tierName} {label}
          </span>
        </div>
      )
    }

    return (
      <span className="text-lg font-semibold">NT${basePrice.toLocaleString()}</span>
    )
  }

  // Guest — show best possible member discount as upsell
  const best = TIER_DISCOUNTS[0]
  const bestMemberPrice = Math.round(basePrice * (1 - best.rate))
  return (
    <div className="space-y-1">
      <span className="text-lg font-semibold">NT${basePrice.toLocaleString()}</span>
      <p className="text-xs text-muted-foreground">
        加入會員最高享{" "}
        <span className="font-medium text-amber-700">
          NT${bestMemberPrice.toLocaleString()}
        </span>
        （{best.name} {((1 - best.rate) * 10).toFixed(1)} 折）
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Write MemberDiscountLine**

`apps/web/src/app/(checkout)/cart/_components/MemberDiscountLine.tsx`:
```typescript
interface MemberDiscountLineProps {
  discountRate: number
  discountAmount: number
  tierName: string
}

export function MemberDiscountLine({
  discountRate,
  discountAmount,
  tierName,
}: MemberDiscountLineProps) {
  if (discountRate === 0 || discountAmount === 0) return null

  const label = `${((1 - discountRate) * 10).toFixed(1)} 折`

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        {tierName} 會員折扣（{label}）
      </span>
      <span className="text-green-600 font-medium">
        - NT${discountAmount.toLocaleString()}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cataholic/Desktop/airport/realreal
git add apps/web/src/app/\(shop\)/products/\[slug\]/_components/MemberPriceBadge.tsx apps/web/src/app/\(checkout\)/cart/_components/MemberDiscountLine.tsx
git commit -m "feat(web): member price badge on product page, discount line in cart — guest upsell for non-members"
```

---

## Task 7: Referral Code System (Future-Flagged)

**Files:**
- Create: `packages/db/migrations/0006_referral_codes.sql`
- Create: `apps/api/src/jobs/referral-reward.job.ts`
- Create: `apps/api/src/routes/referral.ts`

> **Note:** This task is scaffolded but gated behind `FEATURE_REFERRAL=true` env flag. No UI is wired until flag is enabled.

- [ ] **Step 1: Write referral schema migration**

`packages/db/migrations/0006_referral_codes.sql`:
```sql
CREATE TABLE IF NOT EXISTS referral_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  uses        INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_codes_user_id_idx ON referral_codes(user_id);

-- Track which orders came via referral
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS referral_code TEXT REFERENCES referral_codes(code);
```

- [ ] **Step 2: Write referral reward job**

`apps/api/src/jobs/referral-reward.job.ts`:
```typescript
import { Worker, Queue } from "bullmq"
import { redis } from "../lib/redis"
import { supabase } from "../lib/supabase"
import { nanoid } from "nanoid"

export const referralRewardQueue = new Queue("referral-reward", { connection: redis })

// Triggered after a referee places their first paid order.
// Rewards the referrer with a fixed-amount coupon.
export const referralRewardWorker = new Worker(
  "referral-reward",
  async (job) => {
    if (process.env.FEATURE_REFERRAL !== "true") return

    const { referralCode, refereeOrderId } = job.data as {
      referralCode: string
      refereeOrderId: string
    }

    // Find referrer
    const { data: ref } = await supabase
      .from("referral_codes")
      .select("user_id")
      .eq("code", referralCode)
      .single()

    if (!ref) return

    // Issue a NT$100 fixed coupon to referrer
    const couponCode = `REF${nanoid(8).toUpperCase()}`
    await supabase.from("coupons").insert({
      code: couponCode,
      type: "fixed",
      value: 100,
      applicable_to: "order",
      max_uses: 1,
    })

    // Increment referral uses
    await supabase.rpc("increment_referral_uses", { p_code: referralCode })

    return { referrerId: ref.user_id, couponCode }
  },
  { connection: redis }
)
```

- [ ] **Step 3: Write referral API route (generate & lookup)**

`apps/api/src/routes/referral.ts`:
```typescript
import { Router } from "express"
import { nanoid } from "nanoid"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"

const router = Router()

if (process.env.FEATURE_REFERRAL !== "true") {
  router.use((_req, res) => res.status(404).json({ error: "Feature not enabled" }))
  export default router
}

// GET /api/referral/my-code — get or generate referral code for current user
router.get("/my-code", requireAuth, async (req, res) => {
  const userId: string = (res as any).locals.userId

  const { data: existing } = await supabase
    .from("referral_codes")
    .select("code, uses")
    .eq("user_id", userId)
    .single()

  if (existing) { res.json(existing); return }

  const code = `RR${nanoid(8).toUpperCase()}`
  const { data, error } = await supabase
    .from("referral_codes")
    .insert({ user_id: userId, code })
    .select("code, uses")
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json(data)
})

export default router
```

- [ ] **Step 4: Commit**

```bash
cd /Users/cataholic/Desktop/airport/realreal
git add packages/db/migrations/0006_referral_codes.sql apps/api/src/jobs/referral-reward.job.ts apps/api/src/routes/referral.ts
git commit -m "feat(api): referral code system scaffold — gated behind FEATURE_REFERRAL=true env flag"
```

---

## Task 8: Admin Membership Analytics

**Files:**
- Create: `apps/api/src/routes/admin/membership-analytics.ts`
- Create: `apps/web/src/app/admin/membership/page.tsx`
- Create: `apps/web/src/app/admin/membership/_components/TierDistributionChart.tsx`
- Create: `apps/web/src/app/admin/membership/_components/TopCustomersTable.tsx`

- [ ] **Step 1: Write analytics API route**

`apps/api/src/routes/admin/membership-analytics.ts`:
```typescript
import { Router } from "express"
import { supabase } from "../../lib/supabase"
import { requireAuth } from "../../middleware/auth"
import { requireAdmin } from "../../middleware/admin"

const router = Router()
router.use(requireAuth, requireAdmin)

// GET /api/admin/membership/analytics
router.get("/analytics", async (_req, res) => {
  // Tier distribution
  const { data: distribution } = await supabase.rpc("membership_tier_distribution")

  // Total spend by tier
  const { data: spendByTier } = await supabase.rpc("membership_spend_by_tier")

  // Top 20 customers by total_spend
  const { data: topCustomers } = await supabase
    .from("user_profiles")
    .select("id, display_name, total_spend, membership_tiers(name)")
    .order("total_spend", { ascending: false })
    .limit(20)

  res.json({ distribution, spendByTier, topCustomers })
})

export default router
```

- [ ] **Step 2: Write analytics SQL functions migration**

`packages/db/migrations/0007_membership_analytics_rpcs.sql`:
```sql
CREATE OR REPLACE FUNCTION membership_tier_distribution()
RETURNS TABLE(tier_name TEXT, member_count BIGINT)
LANGUAGE sql AS $$
  SELECT mt.name AS tier_name, COUNT(up.id) AS member_count
  FROM membership_tiers mt
  LEFT JOIN user_profiles up ON up.membership_tier_id = mt.id
  GROUP BY mt.name, mt.min_spend
  ORDER BY mt.min_spend;
$$;

CREATE OR REPLACE FUNCTION membership_spend_by_tier()
RETURNS TABLE(tier_name TEXT, total_spend NUMERIC)
LANGUAGE sql AS $$
  SELECT mt.name AS tier_name, COALESCE(SUM(up.total_spend), 0) AS total_spend
  FROM membership_tiers mt
  LEFT JOIN user_profiles up ON up.membership_tier_id = mt.id
  GROUP BY mt.name, mt.min_spend
  ORDER BY mt.min_spend;
$$;

CREATE OR REPLACE FUNCTION increment_referral_uses(p_code TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE referral_codes SET uses = uses + 1 WHERE code = p_code;
END;
$$;
```

- [ ] **Step 3: Register analytics route**

In `apps/api/src/app.ts`, add:
```typescript
import membershipAnalyticsRoutes from "./routes/admin/membership-analytics"
// ...
app.use("/api/admin/membership", membershipAnalyticsRoutes)
```

- [ ] **Step 4: Write admin membership analytics page**

`apps/web/src/app/admin/membership/page.tsx`:
```typescript
import { createServerClient } from "@/lib/supabase/server"
import { TierDistributionChart } from "./_components/TierDistributionChart"
import { TopCustomersTable } from "./_components/TopCustomersTable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AdminMembershipPage() {
  const supabase = await createServerClient()

  const [{ data: distribution }, { data: spendByTier }, { data: topCustomers }] =
    await Promise.all([
      supabase.rpc("membership_tier_distribution"),
      supabase.rpc("membership_spend_by_tier"),
      supabase
        .from("user_profiles")
        .select("id, display_name, total_spend, membership_tiers(name)")
        .order("total_spend", { ascending: false })
        .limit(20),
    ])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">會員分析</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>等級分布</CardTitle>
          </CardHeader>
          <CardContent>
            <TierDistributionChart data={distribution ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>各等級累積消費</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(spendByTier ?? []).map((row: any) => (
                <div key={row.tier_name} className="flex justify-between text-sm">
                  <span>{row.tier_name}</span>
                  <span className="font-medium">
                    NT${Number(row.total_spend).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>高消費會員 Top 20</CardTitle>
        </CardHeader>
        <CardContent>
          <TopCustomersTable customers={topCustomers ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Write TierDistributionChart component**

`apps/web/src/app/admin/membership/_components/TierDistributionChart.tsx`:
```typescript
"use client"

interface TierRow {
  tier_name: string
  member_count: number
}

export function TierDistributionChart({ data }: { data: TierRow[] }) {
  const total = data.reduce((sum, r) => sum + Number(r.member_count), 0)

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">尚無會員資料</p>
  }

  const COLORS: Record<string, string> = {
    "一般會員": "bg-slate-200",
    "銀卡會員": "bg-slate-400",
    "金卡會員": "bg-amber-400",
    "鑽石會員": "bg-sky-400",
  }

  return (
    <div className="space-y-3">
      {data.map((row) => {
        const pct = total > 0 ? Math.round((Number(row.member_count) / total) * 100) : 0
        return (
          <div key={row.tier_name} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{row.tier_name}</span>
              <span className="text-muted-foreground">
                {row.member_count} 人 ({pct}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${COLORS[row.tier_name] ?? "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Write TopCustomersTable component**

`apps/web/src/app/admin/membership/_components/TopCustomersTable.tsx`:
```typescript
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface Customer {
  id: string
  display_name: string | null
  total_spend: string
  membership_tiers: { name: string } | null
}

export function TopCustomersTable({ customers }: { customers: Customer[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>姓名</TableHead>
          <TableHead>等級</TableHead>
          <TableHead className="text-right">累積消費</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((c) => (
          <TableRow key={c.id}>
            <TableCell>{c.display_name ?? "（未設定）"}</TableCell>
            <TableCell>
              <Badge variant="outline">{c.membership_tiers?.name ?? "一般會員"}</Badge>
            </TableCell>
            <TableCell className="text-right font-medium">
              NT${Number(c.total_spend).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 7: Commit**

```bash
cd /Users/cataholic/Desktop/airport/realreal
git add apps/api/src/routes/admin/membership-analytics.ts packages/db/migrations/0007_membership_analytics_rpcs.sql apps/web/src/app/admin/membership/
git commit -m "feat(admin): membership analytics — tier distribution, spend by tier, top customers table"
```

---

## Task 9: Integration Smoke Test + Definition of Done

- [ ] **Step 1: Apply all migrations**

```bash
# Via Supabase dashboard or CLI:
# 0005_membership_discount_columns.sql
# 0006_referral_codes.sql
# 0007_membership_analytics_rpcs.sql
supabase db push --project-ref <PROJECT_REF>
```
Expected: All migrations applied without error

- [ ] **Step 2: Run all unit tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run
```
Expected: All tests PASS — tier logic (5), discount middleware (3), coupon library (6)

- [ ] **Step 3: Smoke test coupon validate endpoint**

```bash
# Start the API:
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npm run dev

# Insert a test coupon in Supabase first, then:
curl -s -X POST http://localhost:4000/api/coupons/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid_jwt>" \
  -d '{"code":"VEGAN10","subtotal":1000,"context":"order"}' | jq .
```
Expected: `{"valid":true,"couponId":"...","discountAmount":100}`

- [ ] **Step 4: Smoke test tier upgrade job**

```bash
# Enqueue a test job via the BullMQ dashboard or a test script:
node -e "
const { tierUpgradeQueue } = require('./dist/jobs/tier-upgrade.job.js')
tierUpgradeQueue.add('test', { userId: '<test_user_id>', orderAmount: 3000 })
"
```
Expected: Worker processes job, user_profiles.total_spend incremented, membership_tier_id updated to 銀卡會員 if previously at 0

- [ ] **Step 5: Verify membership page renders**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npm run dev
```
Open `http://localhost:3000/my-account/membership` as a logged-in user.
Expected: Tier badge, progress bar, benefits list all render without error

- [ ] **Step 6: Verify admin coupon page**

Open `http://localhost:3000/admin/coupons` as an admin user.
Expected: Coupon table renders; "新增優惠碼" dialog opens; bulk-generate button visible

- [ ] **Step 7: Verify admin membership analytics page**

Open `http://localhost:3000/admin/membership` as an admin user.
Expected: Tier distribution bars, spend-by-tier rows, and top customers table all render

- [ ] **Step 8: TypeScript check all packages**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/packages/db && npx tsc --noEmit
```
Expected: Zero errors across all three packages

- [ ] **Step 9: Full test suite**

```bash
cd /Users/cataholic/Desktop/airport/realreal
npx turbo test
```
Expected: All tests PASS

---

## Definition of Done

- [ ] `tierUpgradeQueue` enqueues after payment confirmation; worker updates `user_profiles.total_spend` and `membership_tier_id` correctly for all four tiers
- [ ] `POST /api/coupons/validate` returns correct `discountAmount` for percentage and fixed coupon types; rejects expired, exhausted, and below-min-order coupons with user-facing Traditional Chinese error messages
- [ ] `applyMemberDiscount` middleware attaches `discountRate` and `discountAmount` to `req.body`; guests receive `discountRate: 0`
- [ ] Admin coupon CRUD at `POST/PUT/DELETE /api/admin/coupons` is functional; bulk-generate endpoint creates up to 1,000 unique codes in a single request
- [ ] `/my-account/membership` renders tier badge, cumulative spend, progress bar to next tier, and benefits list for authenticated users; redirects unauthenticated users to `/auth/login`
- [ ] `MemberPriceBadge` shows member price with discount label for logged-in members; shows "加入會員最高享..." upsell for guests
- [ ] `MemberDiscountLine` renders in cart only when `discountRate > 0`
- [ ] Referral code scaffolding is in place; all referral routes/workers return 404 when `FEATURE_REFERRAL` env var is not `"true"`
- [ ] Admin analytics at `/admin/membership` shows tier distribution, spend by tier, and top-20 customers
- [ ] All migrations (0005–0007) applied to Supabase without error
- [ ] `npx turbo test` — all tests PASS (tier: 5, discount: 3, coupon: 6 minimum)
- [ ] `tsc --noEmit` — zero errors in all three packages
