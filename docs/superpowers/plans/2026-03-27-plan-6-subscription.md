# Plan 6: Subscription System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full recurring subscription system — plan seed data, PChomePay Token encryption, subscription CRUD, BullMQ daily billing worker, Next.js subscription pages, webhook handling, failed-payment recovery, and a token-key rotation script — so subscribers are billed automatically every month or every two months.

**Architecture:** BullMQ `subscription-billing` worker (Railway) runs daily at 08:00 Asia/Taipei, queries `subscriptions WHERE status='active' AND next_billing_date <= TODAY`, creates `subscription_orders` with idempotency key `sub_{subscriptionId}_{YYYY-MM-DD}`, charges via PChomePay Token API, and updates the subscription on success or failure. Payment tokens are AES-256 encrypted in `pgcrypto` before storage. Frontend pages at `/subscribe` and `/my-account/subscriptions` give users full lifecycle control.

**Tech Stack:** Express 5, BullMQ, Upstash Redis, Supabase PostgreSQL, pgcrypto, Drizzle ORM, Next.js 15 App Router, shadcn/ui, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-realreal-rewrite-design.md`

**Depends on:** Plan 1 (foundation — monorepo, schema, auth), Plan 3 (checkout/payments — order creation logic reused)

---

## File Map

```
realreal/
├── packages/db/
│   ├── migrations/
│   │   └── 0006_subscription_plans_seed.sql   # Task 1: seed data
│   └── src/schema/
│       └── subscriptions.ts                   # (already in Plan 1, referenced here)
└── apps/
    ├── api/
    │   ├── src/
    │   │   ├── lib/
    │   │   │   └── token-encryption.ts        # Task 2: AES-256 pgcrypto helpers
    │   │   ├── routes/
    │   │   │   └── subscriptions.ts           # Task 3: CRUD routes
    │   │   └── workers/
    │   │       └── subscription-billing.ts    # Task 4: BullMQ daily billing worker
    │   └── scripts/
    │       └── rotate-token-key.ts            # Task 8: key rotation script
    └── web/
        └── src/
            └── app/
                ├── subscribe/
                │   ├── page.tsx               # Task 5: plan selection
                │   └── [planId]/
                │       └── page.tsx           # Task 5: confirm + pay
                └── my-account/
                    └── subscriptions/
                        └── page.tsx           # Task 5: manage subscriptions
```

---

## Task 1: Subscription Plan Seed Data

**Files:**
- Create: `packages/db/migrations/0006_subscription_plans_seed.sql`

- [ ] **Step 1: Write seed migration**

`packages/db/migrations/0006_subscription_plans_seed.sql`:
```sql
-- Seed subscription plans for 誠真生活 RealReal
-- Run once in Supabase SQL Editor (idempotent via ON CONFLICT DO NOTHING)

INSERT INTO subscription_plans (id, name, type, interval, price, qty, benefits, is_active)
VALUES
  (
    gen_random_uuid(),
    '月訂單品補充',
    'replenishment',
    'monthly',
    990.00,
    1,
    '{"free_shipping": true, "discount_rate": 0.05, "description": "每月自動補充您的常用單品，免運費，享 95 折優惠"}'::jsonb,
    TRUE
  ),
  (
    gen_random_uuid(),
    '雙月訂單品補充',
    'replenishment',
    'bimonthly',
    1800.00,
    2,
    '{"free_shipping": true, "discount_rate": 0.08, "description": "每雙月補充兩件單品，免運費，享 92 折優惠，適合囤貨族"}'::jsonb,
    TRUE
  ),
  (
    gen_random_uuid(),
    '月訂健康禮盒',
    'replenishment',
    'monthly',
    1490.00,
    1,
    '{"free_shipping": true, "discount_rate": 0.07, "gift_wrapping": true, "description": "精選健康禮盒每月到府，免運費，享 93 折優惠，含精美包裝"}'::jsonb,
    TRUE
  )
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Apply migration in Supabase SQL Editor**

Paste `0006_subscription_plans_seed.sql` into Supabase Dashboard → SQL Editor → Run
Expected: "Success. 3 rows affected" (or "0 rows affected" if already seeded — idempotent)

- [ ] **Step 3: Verify**

```sql
SELECT id, name, type, interval, price FROM subscription_plans ORDER BY price;
```
Expected: 3 rows — 月訂單品補充 (990), 雙月訂單品補充 (1800), 月訂健康禮盒 (1490)

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0006_subscription_plans_seed.sql
git commit -m "feat(db): seed 3 subscription plans (monthly / bimonthly replenishment)"
```

---

## Task 2: PChomePay Token Encryption

**Files:**
- Create: `apps/api/src/lib/token-encryption.ts`
- Create: `apps/api/src/lib/__tests__/token-encryption.test.ts`

The `TOKEN_ENCRYPTION_KEY` env var holds the symmetric passphrase passed to `pgp_sym_encrypt`. The column `token_key_version` enables future dual-key rotation: the version number tells the billing worker which key to use for decryption.

- [ ] **Step 1: Write failing tests**

`apps/api/src/lib/__tests__/token-encryption.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockEncryptResult = { rows: [{ encrypted: "\\x1234abcd" }] }
const mockDecryptResult = { rows: [{ token: "TOK_ABC123" }] }
const mockQuery = vi.fn()

vi.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

// We test the SQL-generation helpers directly by mocking the db query fn
vi.mock("../token-encryption", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../token-encryption")>()
  return actual
})

import { buildEncryptSql, buildDecryptSql } from "../token-encryption"

describe("buildEncryptSql", () => {
  it("returns pgp_sym_encrypt SQL fragment with placeholder", () => {
    const sql = buildEncryptSql("$1", "$2")
    expect(sql).toContain("pgp_sym_encrypt")
    expect(sql).toContain("$1")
    expect(sql).toContain("$2")
  })
})

describe("buildDecryptSql", () => {
  it("returns pgp_sym_decrypt SQL fragment with placeholder", () => {
    const sql = buildDecryptSql("$1", "$2")
    expect(sql).toContain("pgp_sym_decrypt")
    expect(sql).toContain("$1")
    expect(sql).toContain("$2")
  })
})
```

- [ ] **Step 2: Write token-encryption.ts**

`apps/api/src/lib/token-encryption.ts`:
```typescript
import { createClient } from "@supabase/supabase-js"

const CURRENT_KEY_VERSION = 1

/**
 * Returns the encryption passphrase for the given key version.
 * Add a v2 branch when rotating keys (see rotate-token-key.ts).
 */
export function getEncryptionKey(version: number): string {
  if (version === 1) {
    const key = process.env.TOKEN_ENCRYPTION_KEY
    if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set")
    return key
  }
  // Future: support TOKEN_ENCRYPTION_KEY_V2, TOKEN_ENCRYPTION_KEY_V3, …
  throw new Error(`Unknown token_key_version: ${version}`)
}

/** SQL fragment: pgp_sym_encrypt(plaintext_param, key_param) */
export function buildEncryptSql(
  plaintextParam: string,
  keyParam: string
): string {
  return `pgp_sym_encrypt(${plaintextParam}::text, ${keyParam}::text)`
}

/** SQL fragment: pgp_sym_decrypt(ciphertext_param::bytea, key_param) */
export function buildDecryptSql(
  ciphertextParam: string,
  keyParam: string
): string {
  return `pgp_sym_decrypt(${ciphertextParam}::bytea, ${keyParam}::text)`
}

/**
 * Encrypt a PChomePay token using the current key version.
 * Returns { encryptedHex, keyVersion } for storage in subscriptions table.
 *
 * Relies on pgcrypto being enabled in Supabase (included by default).
 * Uses Supabase service-role client to run raw SQL.
 */
export async function encryptToken(
  supabaseServiceClient: ReturnType<typeof createClient>,
  plainToken: string
): Promise<{ encryptedHex: string; keyVersion: number }> {
  const key = getEncryptionKey(CURRENT_KEY_VERSION)
  const { data, error } = await supabaseServiceClient.rpc(
    "encrypt_payment_token",
    { plain_token: plainToken, passphrase: key }
  )
  if (error) throw new Error(`encryptToken failed: ${error.message}`)
  return { encryptedHex: data as string, keyVersion: CURRENT_KEY_VERSION }
}

/**
 * Decrypt a stored PChomePay token.
 * Reads token_key_version from the subscription record so the correct key
 * is used even during a rotation window where old + new rows coexist.
 */
export async function decryptToken(
  supabaseServiceClient: ReturnType<typeof createClient>,
  encryptedHex: string,
  keyVersion: number
): Promise<string> {
  const key = getEncryptionKey(keyVersion)
  const { data, error } = await supabaseServiceClient.rpc(
    "decrypt_payment_token",
    { encrypted_token: encryptedHex, passphrase: key }
  )
  if (error) throw new Error(`decryptToken failed: ${error.message}`)
  return data as string
}
```

- [ ] **Step 3: Write Supabase SQL helper functions (pgcrypto)**

Apply in Supabase SQL Editor:
```sql
-- Requires pgcrypto (enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION encrypt_payment_token(plain_token TEXT, passphrase TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT encode(pgp_sym_encrypt(plain_token, passphrase), 'hex');
$$;

CREATE OR REPLACE FUNCTION decrypt_payment_token(encrypted_token TEXT, passphrase TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pgp_sym_decrypt(decode(encrypted_token, 'hex'), passphrase);
$$;

-- Revoke public access — only service role may call these
REVOKE ALL ON FUNCTION encrypt_payment_token(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION decrypt_payment_token(TEXT, TEXT) FROM PUBLIC;
```

- [ ] **Step 4: Add TOKEN_ENCRYPTION_KEY to env examples**

`apps/api/.env.example` — add line:
```bash
TOKEN_ENCRYPTION_KEY=   # 32+ char random passphrase for pgp_sym_encrypt
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/lib/__tests__/token-encryption.test.ts
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/token-encryption.ts apps/api/src/lib/__tests__/token-encryption.test.ts apps/api/.env.example
git commit -m "feat(api): PChomePay token AES-256 encryption via pgcrypto pgp_sym_encrypt"
```

---

## Task 3: Subscription CRUD API Routes

**Files:**
- Create: `apps/api/src/routes/subscriptions.ts`
- Create: `apps/api/src/routes/__tests__/subscriptions.test.ts`
- Modify: `apps/api/src/app.ts` — mount router at `/api/subscriptions`

All routes require the `requireAuth` middleware from Plan 1.

- [ ] **Step 1: Write failing tests**

`apps/api/src/routes/__tests__/subscriptions.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import app from "../../app"

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}))

vi.mock("../../lib/token-encryption", () => ({
  encryptToken: vi.fn().mockResolvedValue({
    encryptedHex: "aabbcc",
    keyVersion: 1,
  }),
}))

const authedUser = { id: "user-uuid-001", email: "sub@realreal.cc" }

function authHeaders() {
  return { Authorization: "Bearer valid-token" }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: authedUser }, error: null })
})

describe("POST /api/subscriptions", () => {
  it("returns 400 when planId is missing", async () => {
    const res = await request(app)
      .post("/api/subscriptions")
      .set(authHeaders())
      .send({ paymentToken: "TOK_123" })
    expect(res.status).toBe(400)
  })

  it("returns 400 when paymentToken is missing", async () => {
    const res = await request(app)
      .post("/api/subscriptions")
      .set(authHeaders())
      .send({ planId: "plan-uuid-001" })
    expect(res.status).toBe(400)
  })

  it("returns 201 on valid create", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "plan-uuid-001", name: "月訂單品補充", interval: "monthly", price: "990.00" },
        error: null,
      }),
      insert: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue({
        data: [{ id: "sub-uuid-001" }],
        error: null,
      }),
    })
    const res = await request(app)
      .post("/api/subscriptions")
      .set(authHeaders())
      .send({ planId: "plan-uuid-001", paymentToken: "TOK_ABC123" })
    expect(res.status).toBe(201)
    expect(res.body.data).toHaveProperty("id")
  })
})

describe("GET /api/subscriptions", () => {
  it("returns 200 with user subscriptions array", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: "sub-uuid-001", status: "active" }],
        error: null,
      }),
    })
    const res = await request(app)
      .get("/api/subscriptions")
      .set(authHeaders())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe("PATCH /api/subscriptions/:id", () => {
  it("returns 400 on invalid action", async () => {
    const res = await request(app)
      .patch("/api/subscriptions/sub-uuid-001")
      .set(authHeaders())
      .send({ action: "delete" })
    expect(res.status).toBe(400)
  })

  it("returns 200 on pause", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "sub-uuid-001", user_id: authedUser.id, status: "active" },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue({
        data: [{ id: "sub-uuid-001", status: "paused" }],
        error: null,
      }),
    })
    const res = await request(app)
      .patch("/api/subscriptions/sub-uuid-001")
      .set(authHeaders())
      .send({ action: "pause" })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Write subscriptions route**

`apps/api/src/routes/subscriptions.ts`:
```typescript
import { Router, Request, Response } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { encryptToken } from "../lib/token-encryption"
import { addMonths, addDays, format } from "date-fns"
import { toZonedTime } from "date-fns-tz"

const router = Router()
const TZ = "Asia/Taipei"

const createSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  paymentToken: z.string().min(1),
})

const patchSubscriptionSchema = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
})

// POST /api/subscriptions — create a new subscription
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const parsed = createSubscriptionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() })
  }

  const userId = res.locals.userId as string
  const { planId, paymentToken } = parsed.data

  // Fetch plan
  const { data: plan, error: planError } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("id", planId)
    .eq("is_active", true)
    .single()

  if (planError || !plan) {
    return res.status(404).json({ error: "Subscription plan not found or inactive" })
  }

  // Encrypt token
  const { encryptedHex, keyVersion } = await encryptToken(supabase, paymentToken)

  // Calculate first billing dates
  const now = toZonedTime(new Date(), TZ)
  const intervalMonths = plan.interval === "bimonthly" ? 2 : 1
  const periodEnd = addMonths(now, intervalMonths)
  const nextBillingDate = format(periodEnd, "yyyy-MM-dd")

  const { data: rows, error: insertError } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan_id: planId,
      type: plan.type,
      status: "active",
      payment_method: "pchomepay",
      payment_method_token: encryptedHex,
      token_key_version: keyVersion,
      retry_count: 0,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_billing_date: nextBillingDate,
    })
    .select("id, status, next_billing_date")

  if (insertError || !rows?.length) {
    return res.status(500).json({ error: "Failed to create subscription" })
  }

  return res.status(201).json({ data: rows[0] })
})

// GET /api/subscriptions — list user's subscriptions
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = res.locals.userId as string

  const { data, error } = await supabase
    .from("subscriptions")
    .select(`
      id, status, type, next_billing_date, current_period_start, current_period_end,
      retry_count, created_at,
      subscription_plans (id, name, interval, price)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    return res.status(500).json({ error: "Failed to fetch subscriptions" })
  }

  // Never expose payment_method_token to client
  return res.status(200).json({ data })
})

// PATCH /api/subscriptions/:id — pause / resume / cancel
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const parsed = patchSubscriptionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: "action must be one of: pause, resume, cancel" })
  }

  const userId = res.locals.userId as string
  const { id } = req.params
  const { action } = parsed.data

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from("subscriptions")
    .select("id, user_id, status")
    .eq("id", id)
    .single()

  if (fetchError || !existing) {
    return res.status(404).json({ error: "Subscription not found" })
  }
  if (existing.user_id !== userId) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const statusMap: Record<string, string> = {
    pause: "paused",
    resume: "active",
    cancel: "cancelled",
  }

  const { data: updated, error: updateError } = await supabase
    .from("subscriptions")
    .update({ status: statusMap[action] })
    .eq("id", id)
    .select("id, status, next_billing_date")

  if (updateError || !updated?.length) {
    return res.status(500).json({ error: "Failed to update subscription" })
  }

  return res.status(200).json({ data: updated[0] })
})

export default router
```

- [ ] **Step 3: Mount router in app.ts**

In `apps/api/src/app.ts`, add:
```typescript
import subscriptionsRouter from "./routes/subscriptions"
// ...
app.use("/api/subscriptions", subscriptionsRouter)
```

- [ ] **Step 4: Install date-fns**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install date-fns date-fns-tz
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/routes/__tests__/subscriptions.test.ts
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/subscriptions.ts apps/api/src/routes/__tests__/subscriptions.test.ts apps/api/src/app.ts
git commit -m "feat(api): subscription CRUD routes — create, list, pause/resume/cancel"
```

---

## Task 4: BullMQ Subscription-Billing Worker

**Files:**
- Create: `apps/api/src/workers/subscription-billing.ts`
- Create: `apps/api/src/workers/__tests__/subscription-billing.test.ts`
- Modify: `apps/api/src/index.ts` — start worker on boot

The worker runs a scheduled job daily at 08:00 Asia/Taipei. It finds all active subscriptions due today, creates idempotency-keyed `subscription_orders`, charges via PChomePay Token API, then either advances `next_billing_date` on success or increments `retry_count` (max 3) and sets `status='past_due'` after 3 consecutive failures.

Idempotency key format: `sub_{subscriptionId}_{YYYY-MM-DD}` (date in Asia/Taipei timezone).

- [ ] **Step 1: Install BullMQ and Upstash Redis client**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install bullmq ioredis
```

- [ ] **Step 2: Write failing tests**

`apps/api/src/workers/__tests__/subscription-billing.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  buildIdempotencyKey,
  computeNextBillingDate,
  MAX_RETRY_COUNT,
} from "../subscription-billing"

describe("buildIdempotencyKey", () => {
  it("formats key as sub_{id}_{YYYY-MM-DD}", () => {
    const key = buildIdempotencyKey("abc-123", new Date("2026-03-27T00:00:00+08:00"))
    expect(key).toBe("sub_abc-123_2026-03-27")
  })

  it("uses Asia/Taipei date (not UTC)", () => {
    // 2026-03-27T23:30:00 UTC = 2026-03-28T07:30:00 Taipei
    const key = buildIdempotencyKey("sub-999", new Date("2026-03-27T23:30:00Z"))
    expect(key).toBe("sub_sub-999_2026-03-28")
  })
})

describe("computeNextBillingDate", () => {
  it("adds 1 month for monthly interval", () => {
    const next = computeNextBillingDate("2026-03-27", "monthly")
    expect(next).toBe("2026-04-27")
  })

  it("adds 2 months for bimonthly interval", () => {
    const next = computeNextBillingDate("2026-03-27", "bimonthly")
    expect(next).toBe("2026-05-27")
  })
})

describe("MAX_RETRY_COUNT", () => {
  it("equals 3", () => {
    expect(MAX_RETRY_COUNT).toBe(3)
  })
})
```

- [ ] **Step 3: Write subscription-billing.ts**

`apps/api/src/workers/subscription-billing.ts`:
```typescript
import { Queue, Worker, Job } from "bullmq"
import IORedis from "ioredis"
import { addMonths, format, parseISO } from "date-fns"
import { toZonedTime, fromZonedTime } from "date-fns-tz"
import { supabase } from "../lib/supabase"
import { decryptToken } from "../lib/token-encryption"

export const MAX_RETRY_COUNT = 3
const TZ = "Asia/Taipei"
const QUEUE_NAME = "subscription-billing"

// ─── Exported pure helpers (tested in unit tests) ────────────────────────────

export function buildIdempotencyKey(subscriptionId: string, now: Date): string {
  const taipeiDate = toZonedTime(now, TZ)
  return `sub_${subscriptionId}_${format(taipeiDate, "yyyy-MM-dd")}`
}

export function computeNextBillingDate(
  currentDateStr: string,
  interval: "monthly" | "bimonthly"
): string {
  const current = parseISO(currentDateStr)
  const months = interval === "bimonthly" ? 2 : 1
  return format(addMonths(current, months), "yyyy-MM-dd")
}

// ─── PChomePay Token charge ───────────────────────────────────────────────────

async function chargeViaToken(params: {
  merchantId: string
  hashKey: string
  hashIV: string
  token: string
  amount: number
  orderId: string
  description: string
}): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  // PChomePay Token recurring charge API
  // Reference: PChomePay Token API documentation
  const endpoint = "https://payment.pchomepay.com.tw/api/token/charge"

  const body = {
    MerchantID: params.merchantId,
    MerchantOrderNo: params.orderId,
    Amt: params.amount,
    TokenValue: params.token,
    TokenTerm: "RealReal_recurring",
    Desc: params.description,
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await response.json() as Record<string, unknown>
    if (data.Status === "SUCCESS") {
      return { success: true, transactionId: data.TradeNo as string }
    }
    return { success: false, error: (data.Message as string) ?? "PChomePay charge failed" }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

// ─── Core billing logic ───────────────────────────────────────────────────────

export async function processBillingCycle(): Promise<void> {
  const now = new Date()
  const taipeiToday = format(toZonedTime(now, TZ), "yyyy-MM-dd")

  // Fetch all active subscriptions due today or overdue
  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select(`
      id, user_id, plan_id, type, status, payment_method_token, token_key_version,
      retry_count, next_billing_date,
      subscription_plans (id, name, interval, price)
    `)
    .eq("status", "active")
    .lte("next_billing_date", taipeiToday)

  if (error) {
    console.error("[subscription-billing] Failed to fetch subscriptions:", error.message)
    return
  }

  if (!subs || subs.length === 0) {
    console.log("[subscription-billing] No subscriptions due today.")
    return
  }

  console.log(`[subscription-billing] Processing ${subs.length} subscription(s) for ${taipeiToday}`)

  for (const sub of subs) {
    const idempotencyKey = buildIdempotencyKey(sub.id, now)
    const plan = sub.subscription_plans as {
      id: string; name: string; interval: string; price: string
    }

    // Check for existing subscription_order (idempotency guard)
    const { data: existingOrder } = await supabase
      .from("subscription_orders")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .single()

    if (existingOrder?.status === "completed") {
      console.log(`[subscription-billing] Already billed: ${idempotencyKey} — skipping`)
      continue
    }

    // Create or reuse subscription_order record
    let subOrderId: string

    if (existingOrder) {
      subOrderId = existingOrder.id
    } else {
      // Get current billing cycle count
      const { count } = await supabase
        .from("subscription_orders")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", sub.id)

      const { data: newOrder, error: orderInsertError } = await supabase
        .from("subscription_orders")
        .insert({
          subscription_id: sub.id,
          billing_cycle: (count ?? 0) + 1,
          idempotency_key: idempotencyKey,
          status: "pending",
        })
        .select("id")
        .single()

      if (orderInsertError || !newOrder) {
        console.error(`[subscription-billing] Failed to create sub order for ${sub.id}:`, orderInsertError?.message)
        continue
      }
      subOrderId = newOrder.id
    }

    // Decrypt token
    let plainToken: string
    try {
      plainToken = await decryptToken(
        supabase,
        sub.payment_method_token,
        sub.token_key_version
      )
    } catch (decryptErr) {
      console.error(`[subscription-billing] Token decrypt failed for ${sub.id}:`, (decryptErr as Error).message)
      await handleBillingFailure(sub, subOrderId, "Token decryption failed")
      continue
    }

    // Charge
    const amount = Math.round(parseFloat(plan.price))
    const chargeResult = await chargeViaToken({
      merchantId: process.env.PCHOMEPAY_MERCHANT_ID!,
      hashKey: process.env.PCHOMEPAY_HASH_KEY!,
      hashIV: process.env.PCHOMEPAY_HASH_IV!,
      token: plainToken,
      amount,
      orderId: idempotencyKey,
      description: plan.name,
    })

    if (chargeResult.success) {
      await handleBillingSuccess(sub, subOrderId, chargeResult.transactionId!, plan)
    } else {
      await handleBillingFailure(sub, subOrderId, chargeResult.error ?? "Unknown error")
    }
  }
}

async function handleBillingSuccess(
  sub: { id: string; user_id: string; plan_id: string; next_billing_date: string },
  subOrderId: string,
  transactionId: string,
  plan: { id: string; name: string; interval: string; price: string }
): Promise<void> {
  // Create order record (reuses order creation logic from Plan 3 checkout flow)
  const orderNumber = `SUB-${Date.now()}`
  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: sub.user_id,
      status: "paid",
      subtotal: plan.price,
      shipping_fee: "0",
      discount_amount: "0",
      total: plan.price,
      shipping_method: "subscription",
      payment_method: "pchomepay_token",
      payment_status: "paid",
      notes: `Subscription billing: ${plan.name} — ${transactionId}`,
    })
    .select("id")
    .single()

  if (orderError || !orderRow) {
    console.error(`[subscription-billing] Failed to create order for ${sub.id}:`, orderError?.message)
    // Do not fail the subscription update — billing succeeded
  }

  const nextBillingDate = computeNextBillingDate(
    sub.next_billing_date,
    plan.interval as "monthly" | "bimonthly"
  )

  // Update subscription_order
  await supabase
    .from("subscription_orders")
    .update({
      status: "completed",
      order_id: orderRow?.id ?? null,
    })
    .eq("id", subOrderId)

  // Advance subscription
  await supabase
    .from("subscriptions")
    .update({
      retry_count: 0,
      next_billing_date: nextBillingDate,
      current_period_start: new Date().toISOString(),
    })
    .eq("id", sub.id)

  console.log(`[subscription-billing] Billed ${sub.id} — next: ${nextBillingDate}`)
}

async function handleBillingFailure(
  sub: { id: string; retry_count: number },
  subOrderId: string,
  reason: string
): Promise<void> {
  const newRetryCount = (sub.retry_count ?? 0) + 1
  const newStatus = newRetryCount >= MAX_RETRY_COUNT ? "past_due" : "active"

  await supabase
    .from("subscription_orders")
    .update({ status: "failed" })
    .eq("id", subOrderId)

  await supabase
    .from("subscriptions")
    .update({ retry_count: newRetryCount, status: newStatus })
    .eq("id", sub.id)

  console.warn(
    `[subscription-billing] Billing failed for ${sub.id} — attempt ${newRetryCount}/${MAX_RETRY_COUNT}: ${reason}`
  )

  // Enqueue email notification (Task 7 — email-sender worker)
  if (newStatus === "past_due" || newRetryCount === 1) {
    try {
      const emailQueue = new Queue("email-sender", { connection: getRedisConnection() })
      await emailQueue.add(
        "subscription-payment-failed",
        {
          subscriptionId: sub.id,
          retryCount: newRetryCount,
          isPastDue: newStatus === "past_due",
          reason,
        },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
      )
    } catch (emailErr) {
      console.error("[subscription-billing] Failed to enqueue failure email:", (emailErr as Error).message)
    }
  }
}

// ─── Redis connection ─────────────────────────────────────────────────────────

let _redis: IORedis | null = null

function getRedisConnection(): IORedis {
  if (!_redis) {
    _redis = new IORedis(process.env.UPSTASH_REDIS_REST_URL!, {
      password: process.env.UPSTASH_REDIS_REST_TOKEN,
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: null,
    })
  }
  return _redis
}

// ─── Queue + Worker setup ─────────────────────────────────────────────────────

export function createBillingQueue(): Queue {
  return new Queue(QUEUE_NAME, { connection: getRedisConnection() })
}

export function startSubscriptionBillingWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      await processBillingCycle()
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    }
  )

  worker.on("failed", (job, err) => {
    console.error(`[subscription-billing] Job ${job?.id} failed:`, err.message)
  })

  return worker
}

/**
 * Schedule daily billing job at 08:00 Asia/Taipei.
 * Called once from apps/api/src/index.ts on server boot.
 */
export async function scheduleDailyBillingJob(): Promise<void> {
  const queue = createBillingQueue()

  // Remove any existing repeatable job to avoid duplicates on redeploy
  const repeatableJobs = await queue.getRepeatableJobs()
  for (const job of repeatableJobs) {
    if (job.name === "daily-billing") {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  await queue.add(
    "daily-billing",
    {},
    {
      repeat: {
        // 08:00 Asia/Taipei = 00:00 UTC
        cron: "0 0 * * *",
        tz: TZ,
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    }
  )

  startSubscriptionBillingWorker()
  console.log("[subscription-billing] Daily billing job scheduled at 08:00 Asia/Taipei")
}
```

- [ ] **Step 4: Start worker in index.ts**

In `apps/api/src/index.ts`, add after server starts:
```typescript
import { scheduleDailyBillingJob } from "./workers/subscription-billing"
// ...
app.listen(PORT, async () => {
  console.log(`API server started on port ${PORT}`)
  await scheduleDailyBillingJob()
})
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/workers/__tests__/subscription-billing.test.ts
```
Expected: All tests PASS (pure helper functions — no Redis/Supabase needed)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workers/subscription-billing.ts apps/api/src/workers/__tests__/subscription-billing.test.ts apps/api/src/index.ts
git commit -m "feat(api): BullMQ subscription-billing worker — daily 08:00 Taipei, idempotency key, max 3 retries"
```

---

## Task 5: Next.js Subscription Pages

**Files:**
- Create: `apps/web/src/app/subscribe/page.tsx`
- Create: `apps/web/src/app/subscribe/[planId]/page.tsx`
- Create: `apps/web/src/app/my-account/subscriptions/page.tsx`

- [ ] **Step 1: Install additional shadcn components**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx shadcn@latest add badge separator alert
```

- [ ] **Step 2: Write plan selection page**

`apps/web/src/app/subscribe/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface SubscriptionPlan {
  id: string
  name: string
  type: string
  interval: string
  price: string
  qty: number | null
  benefits: Record<string, unknown> | null
  is_active: boolean
}

export default async function SubscribePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login?redirect=/subscribe")

  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price", { ascending: true })

  const intervalLabel = (interval: string) =>
    interval === "bimonthly" ? "每兩個月" : "每個月"

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight">訂閱方案</h1>
        <p className="text-muted-foreground mt-2">自動補充您的健康日常，省心更省錢</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan: SubscriptionPlan) => {
          const benefits = plan.benefits as Record<string, unknown> | null
          return (
            <Card key={plan.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <Badge variant="secondary">{intervalLabel(plan.interval)}</Badge>
                </div>
                <CardDescription>
                  {(benefits?.description as string) ?? ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-3xl font-bold">
                  NT${Number(plan.price).toLocaleString()}
                  <span className="text-base font-normal text-muted-foreground ml-1">
                    /{intervalLabel(plan.interval)}
                  </span>
                </div>
                <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                  {benefits?.free_shipping && <li>✓ 免運費</li>}
                  {benefits?.discount_rate && (
                    <li>✓ {Math.round((1 - Number(benefits.discount_rate)) * 100)}折 優惠</li>
                  )}
                  {benefits?.gift_wrapping && <li>✓ 精美包裝</li>}
                  {plan.qty && <li>✓ 每期 {plan.qty} 件</li>}
                </ul>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href={`/subscribe/${plan.id}`}>選擇此方案</Link>
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write plan confirmation + payment page**

`apps/web/src/app/subscribe/[planId]/page.tsx`:
```typescript
"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { apiClient } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"

interface Plan {
  id: string
  name: string
  interval: string
  price: string
  benefits: Record<string, unknown> | null
}

export default function SubscribeConfirmPage() {
  const { planId } = useParams<{ planId: string }>()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError("找不到此方案")
        else setPlan(data)
        setIsLoading(false)
      })
  }, [planId])

  // PChomePay token registration redirects back with token in query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("pchomepay_token")
    if (token && planId) {
      handleSubscribeWithToken(token)
    }
  }, [planId])

  async function handleSubscribeWithToken(token: string) {
    setIsSubscribing(true)
    setError("")
    try {
      await apiClient("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({ planId, paymentToken: token }),
      })
      toast.success("訂閱成功！")
      router.push("/my-account/subscriptions")
    } catch (err) {
      setError("訂閱建立失敗，請再試一次")
      setIsSubscribing(false)
    }
  }

  function handleRegisterToken() {
    if (!plan) return
    // Redirect to PChomePay token registration page
    // After registration, PChomePay redirects back to this page with ?pchomepay_token=...
    const returnUrl = encodeURIComponent(
      `${window.location.origin}/subscribe/${planId}`
    )
    const registrationUrl =
      `https://payment.pchomepay.com.tw/api/token/register` +
      `?MerchantID=${process.env.NEXT_PUBLIC_PCHOMEPAY_MERCHANT_ID}` +
      `&ReturnURL=${returnUrl}` +
      `&TokenTerm=RealReal_recurring`
    window.location.href = registrationUrl
  }

  if (isLoading) return <div className="flex justify-center py-20">載入中…</div>
  if (!plan) return <div className="flex justify-center py-20 text-destructive">{error}</div>

  const intervalLabel = plan.interval === "bimonthly" ? "每兩個月" : "每個月"

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">確認訂閱</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{plan.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">訂閱週期</span>
            <span>{intervalLabel}自動扣款</span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-muted-foreground">每期金額</span>
            <span className="text-xl font-bold">NT${Number(plan.price).toLocaleString()}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            訂閱後將以 PChomePay 綁定信用卡自動扣款。您可隨時在帳戶中暫停或取消訂閱。
          </p>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={handleRegisterToken}
        disabled={isSubscribing}
      >
        {isSubscribing ? "處理中…" : "綁定信用卡並開始訂閱"}
      </Button>

      <p className="text-center text-xs text-muted-foreground mt-4">
        系統採用 PChomePay Token 加密儲存，我們不直接儲存您的卡號。
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Write my-account subscriptions page**

`apps/web/src/app/my-account/subscriptions/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { SubscriptionsClient } from "./subscriptions-client"

export default async function MySubscriptionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login?redirect=/my-account/subscriptions")

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select(`
      id, status, type, next_billing_date, current_period_start,
      retry_count, created_at,
      subscription_plans (id, name, interval, price)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">我的訂閱</h1>
        <Link
          href="/subscribe"
          className="text-sm text-primary underline underline-offset-4"
        >
          新增訂閱
        </Link>
      </div>

      {!subscriptions?.length ? (
        <div className="text-center py-20 text-muted-foreground">
          <p>您目前沒有訂閱方案</p>
          <Link href="/subscribe" className="mt-4 inline-block text-primary underline">
            立即訂閱
          </Link>
        </div>
      ) : (
        <SubscriptionsClient subscriptions={subscriptions} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write SubscriptionsClient component**

`apps/web/src/app/my-account/subscriptions/subscriptions-client.tsx`:
```typescript
"use client"

import { useState } from "react"
import { apiClient } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface SubscriptionPlan {
  id: string
  name: string
  interval: string
  price: string
}

interface Subscription {
  id: string
  status: string
  type: string
  next_billing_date: string | null
  current_period_start: string | null
  retry_count: number
  created_at: string
  subscription_plans: SubscriptionPlan | null
}

const STATUS_LABELS: Record<string, string> = {
  active: "訂閱中",
  paused: "已暫停",
  cancelled: "已取消",
  past_due: "付款逾期",
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  cancelled: "outline",
  past_due: "destructive",
}

export function SubscriptionsClient({ subscriptions }: { subscriptions: Subscription[] }) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleAction(id: string, action: "pause" | "resume" | "cancel") {
    const confirmMessages: Record<string, string> = {
      pause: "確定要暫停此訂閱嗎？",
      resume: "確定要恢復此訂閱嗎？",
      cancel: "確定要取消此訂閱嗎？取消後無法恢復。",
    }
    if (!window.confirm(confirmMessages[action])) return

    setLoadingId(id)
    try {
      await apiClient(`/api/subscriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      })
      toast.success("訂閱狀態已更新")
      router.refresh()
    } catch {
      toast.error("操作失敗，請再試一次")
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {subscriptions.map((sub) => {
        const plan = sub.subscription_plans
        const isLoading = loadingId === sub.id
        const intervalLabel = plan?.interval === "bimonthly" ? "每兩個月" : "每個月"

        return (
          <Card key={sub.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{plan?.name ?? "訂閱方案"}</CardTitle>
                <Badge variant={STATUS_VARIANTS[sub.status] ?? "outline"}>
                  {STATUS_LABELS[sub.status] ?? sub.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>週期</span>
                  <span>{intervalLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span>金額</span>
                  <span>NT${Number(plan?.price ?? 0).toLocaleString()}</span>
                </div>
                {sub.next_billing_date && (
                  <div className="flex justify-between">
                    <span>下次扣款日</span>
                    <span>{sub.next_billing_date}</span>
                  </div>
                )}
                {sub.retry_count > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>扣款失敗次數</span>
                    <span>{sub.retry_count} / 3</span>
                  </div>
                )}
              </div>

              {sub.status !== "cancelled" && (
                <div className="flex gap-2 mt-4">
                  {sub.status === "active" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction(sub.id, "pause")}
                      disabled={isLoading}
                    >
                      暫停
                    </Button>
                  )}
                  {sub.status === "paused" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction(sub.id, "resume")}
                      disabled={isLoading}
                    >
                      恢復
                    </Button>
                  )}
                  {(sub.status === "active" || sub.status === "paused") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleAction(sub.id, "cancel")}
                      disabled={isLoading}
                    >
                      取消訂閱
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Update middleware to protect /subscribe route for logged-in state check**

Confirm `apps/web/src/middleware.ts` matcher already includes `/my-account/:path*`. The `/subscribe` route itself is public (plan selection), but `/subscribe/[planId]` redirects to login server-side.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/subscribe apps/web/src/app/my-account/subscriptions
git commit -m "feat(web): subscription pages — plan selection, confirm+pay, my-account manage"
```

---

## Task 6: PChomePay Token Registration Webhook

**Files:**
- Create: `apps/api/src/routes/webhooks/pchomepay-token.ts`
- Modify: `apps/api/src/app.ts` — mount webhook route

PChomePay calls this endpoint after a user completes token registration (card binding). The webhook updates `subscriptions.payment_method_token` with the fresh encrypted token and confirms the subscription is active.

- [ ] **Step 1: Write webhook route**

`apps/api/src/routes/webhooks/pchomepay-token.ts`:
```typescript
import { Router, Request, Response } from "express"
import crypto from "node:crypto"
import { supabase } from "../../lib/supabase"
import { encryptToken } from "../../lib/token-encryption"

const router = Router()

function verifyPChomePaySignature(
  payload: Record<string, string>,
  hashKey: string,
  hashIV: string,
  receivedCheckMac: string
): boolean {
  // PChomePay signature: sort keys, join as key=value&, SHA256 with key+IV wrapping
  const sorted = Object.keys(payload)
    .filter((k) => k !== "CheckMacValue")
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join("&")
  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`
  const encoded = encodeURIComponent(raw).toLowerCase()
    .replace(/%20/g, "+")
    .replace(/%21/g, "!")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%2a/g, "*")
  const computed = crypto
    .createHash("sha256")
    .update(encoded)
    .digest("hex")
    .toUpperCase()
  return computed === receivedCheckMac
}

// POST /api/webhooks/pchomepay-token
// PChomePay calls this after token registration (card binding) completes.
router.post("/", async (req: Request, res: Response) => {
  const payload = req.body as Record<string, string>
  const hashKey = process.env.PCHOMEPAY_HASH_KEY!
  const hashIV = process.env.PCHOMEPAY_HASH_IV!

  // Verify signature
  if (!verifyPChomePaySignature(payload, hashKey, hashIV, payload.CheckMacValue ?? "")) {
    console.warn("[pchomepay-token webhook] Invalid signature")
    return res.status(400).send("0|Invalid signature")
  }

  const { Status, TokenValue, MerchantOrderNo } = payload

  if (Status !== "SUCCESS" || !TokenValue) {
    console.warn("[pchomepay-token webhook] Non-success status:", Status)
    return res.send("1|OK")
  }

  // MerchantOrderNo encodes the subscription ID (set during token registration redirect)
  // Format: TOKREG_{subscriptionId}
  const subscriptionId = MerchantOrderNo?.replace("TOKREG_", "")
  if (!subscriptionId) {
    return res.status(400).send("0|Missing subscription ID")
  }

  try {
    const { encryptedHex, keyVersion } = await encryptToken(supabase, TokenValue)

    const { error } = await supabase
      .from("subscriptions")
      .update({
        payment_method_token: encryptedHex,
        token_key_version: keyVersion,
        status: "active",
      })
      .eq("id", subscriptionId)

    if (error) {
      console.error("[pchomepay-token webhook] DB update failed:", error.message)
      return res.status(500).send("0|DB error")
    }

    console.log(`[pchomepay-token webhook] Token updated for subscription ${subscriptionId}`)
    return res.send("1|OK")
  } catch (err) {
    console.error("[pchomepay-token webhook] Encrypt failed:", (err as Error).message)
    return res.status(500).send("0|Encrypt error")
  }
})

export default router
```

- [ ] **Step 2: Mount webhook in app.ts**

In `apps/api/src/app.ts`, add before other routes (raw body needed for signature validation):
```typescript
import pchomepayTokenWebhook from "./routes/webhooks/pchomepay-token"
// ...
app.use("/api/webhooks/pchomepay-token", express.urlencoded({ extended: true }), pchomepayTokenWebhook)
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/webhooks/pchomepay-token.ts apps/api/src/app.ts
git commit -m "feat(api): PChomePay token registration webhook — verify signature, encrypt and store token"
```

---

## Task 7: Failed Payment Recovery

**Files:**
- Create: `apps/api/src/workers/email-sender.ts`
- Modify: `apps/api/src/index.ts` — start email-sender worker

The billing worker (Task 4) already enqueues `email-sender` jobs on failure. This task implements the email-sender worker that reads those jobs and sends email notifications.

- [ ] **Step 1: Install nodemailer**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Write email-sender worker**

`apps/api/src/workers/email-sender.ts`:
```typescript
import { Worker, Job } from "bullmq"
import nodemailer from "nodemailer"
import IORedis from "ioredis"
import { supabase } from "../lib/supabase"

const QUEUE_NAME = "email-sender"

interface SubscriptionFailedPayload {
  subscriptionId: string
  retryCount: number
  isPastDue: boolean
  reason: string
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: 587,
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_PASS,
    },
  })
}

async function sendSubscriptionFailureEmail(payload: SubscriptionFailedPayload): Promise<void> {
  // Fetch subscription + user email
  const { data: sub } = await supabase
    .from("subscriptions")
    .select(`
      id, retry_count, next_billing_date,
      subscription_plans (name),
      user_profiles!inner (display_name),
      user_id
    `)
    .eq("id", payload.subscriptionId)
    .single()

  if (!sub) {
    console.error(`[email-sender] Subscription not found: ${payload.subscriptionId}`)
    return
  }

  // Get user email from Supabase Auth
  const { data: { user } } = await supabase.auth.admin.getUserById(sub.user_id)
  if (!user?.email) return

  const plan = sub.subscription_plans as { name: string } | null
  const profile = sub.user_profiles as { display_name: string | null } | null
  const displayName = profile?.display_name ?? "您好"

  const transport = getTransport()

  if (payload.isPastDue) {
    // Final failure — past_due, notify user + admin
    await transport.sendMail({
      from: `"誠真生活 RealReal" <no-reply@realreal.cc>`,
      to: user.email,
      subject: "【誠真生活】訂閱扣款失敗通知",
      html: `
        <p>${displayName}，</p>
        <p>您的訂閱方案「${plan?.name ?? ""}」已連續 3 次扣款失敗，訂閱狀態已設為逾期（past_due）。</p>
        <p>請至 <a href="https://realreal.cc/my-account/subscriptions">我的訂閱</a> 更新付款方式，或重新訂閱。</p>
        <p>如有疑問，請聯繫客服。</p>
        <p>誠真生活 RealReal 敬上</p>
      `,
    })

    // Admin alert
    const adminEmail = process.env.ADMIN_ALERT_EMAIL
    if (adminEmail) {
      await transport.sendMail({
        from: `"RealReal System" <no-reply@realreal.cc>`,
        to: adminEmail,
        subject: `[Admin Alert] 訂閱 ${payload.subscriptionId} 已 past_due`,
        text: [
          `Subscription ID: ${payload.subscriptionId}`,
          `User Email: ${user.email}`,
          `Plan: ${plan?.name ?? ""}`,
          `Failure reason: ${payload.reason}`,
          `Retry count: ${payload.retryCount}`,
          `Next billing date: ${sub.next_billing_date}`,
        ].join("\n"),
      })
    }
  } else {
    // First failure — gentle reminder
    await transport.sendMail({
      from: `"誠真生活 RealReal" <no-reply@realreal.cc>`,
      to: user.email,
      subject: "【誠真生活】訂閱扣款失敗，我們將自動重試",
      html: `
        <p>${displayName}，</p>
        <p>您的訂閱方案「${plan?.name ?? ""}」本次扣款未成功（第 ${payload.retryCount} 次）。</p>
        <p>我們將在下次帳單週期自動重試。如需更新付款方式，請至
           <a href="https://realreal.cc/my-account/subscriptions">我的訂閱</a>。</p>
        <p>誠真生活 RealReal 敬上</p>
      `,
    })
  }
}

let _redis: IORedis | null = null

function getRedisConnection(): IORedis {
  if (!_redis) {
    _redis = new IORedis(process.env.UPSTASH_REDIS_REST_URL!, {
      password: process.env.UPSTASH_REDIS_REST_TOKEN,
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: null,
    })
  }
  return _redis
}

export function startEmailSenderWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const jobName = job.name
      if (jobName === "subscription-payment-failed") {
        await sendSubscriptionFailureEmail(job.data as SubscriptionFailedPayload)
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  )

  worker.on("failed", (job, err) => {
    console.error(`[email-sender] Job ${job?.id} failed:`, err.message)
  })

  console.log("[email-sender] Worker started")
  return worker
}
```

- [ ] **Step 3: Start email-sender worker in index.ts**

In `apps/api/src/index.ts`, add:
```typescript
import { startEmailSenderWorker } from "./workers/email-sender"
// ...
// Inside the app.listen callback, alongside scheduleDailyBillingJob():
startEmailSenderWorker()
```

- [ ] **Step 4: Add ADMIN_ALERT_EMAIL to env examples**

`apps/api/.env.example` — add:
```bash
ADMIN_ALERT_EMAIL=    # Email address to receive past_due subscription alerts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/email-sender.ts apps/api/src/index.ts apps/api/.env.example
git commit -m "feat(api): email-sender BullMQ worker — subscription failure notifications + admin past_due alert"
```

---

## Task 8: Token Key Rotation Script

**Files:**
- Create: `apps/api/scripts/rotate-token-key.ts`

Zero-downtime strategy: add `TOKEN_ENCRYPTION_KEY_V2` to env, run this script to re-encrypt all v1 tokens with the new key. The billing worker always reads `token_key_version` from the DB row and calls `getEncryptionKey(version)`, so old tokens encrypted with v1 continue to work until the script finishes. After rotation, remove v1 key from env.

- [ ] **Step 1: Write rotation script**

`apps/api/scripts/rotate-token-key.ts`:
```typescript
import { createClient } from "@supabase/supabase-js"

/**
 * Token Key Rotation Script
 *
 * Zero-downtime approach:
 * 1. Set TOKEN_ENCRYPTION_KEY_V2 in Railway env (keep V1 in place for now).
 * 2. Run this script: it re-encrypts all tokens from v1 → v2 in batches.
 * 3. After script completes successfully, remove TOKEN_ENCRYPTION_KEY from env
 *    and rename TOKEN_ENCRYPTION_KEY_V2 → TOKEN_ENCRYPTION_KEY, reset version to 2.
 *
 * Usage:
 *   FROM_VERSION=1 TO_VERSION=2 npx tsx scripts/rotate-token-key.ts
 */

const FROM_VERSION = parseInt(process.env.FROM_VERSION ?? "1", 10)
const TO_VERSION = parseInt(process.env.TO_VERSION ?? "2", 10)
const BATCH_SIZE = 50
const DRY_RUN = process.env.DRY_RUN === "true"

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  process.exit(1)
}

function getKeyForVersion(version: number): string {
  if (version === 1) {
    const key = process.env.TOKEN_ENCRYPTION_KEY
    if (!key) throw new Error("TOKEN_ENCRYPTION_KEY not set")
    return key
  }
  if (version === 2) {
    const key = process.env.TOKEN_ENCRYPTION_KEY_V2
    if (!key) throw new Error("TOKEN_ENCRYPTION_KEY_V2 not set")
    return key
  }
  throw new Error(`Unknown key version: ${version}`)
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function rotateTokens(): Promise<void> {
  console.log(`\nToken Key Rotation: v${FROM_VERSION} → v${TO_VERSION}`)
  if (DRY_RUN) console.log("DRY RUN — no writes will be made\n")

  const fromKey = getKeyForVersion(FROM_VERSION)
  const toKey = getKeyForVersion(TO_VERSION)

  let offset = 0
  let totalRotated = 0
  let totalErrors = 0

  while (true) {
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, payment_method_token, token_key_version")
      .eq("token_key_version", FROM_VERSION)
      .not("payment_method_token", "is", null)
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error(`❌ Failed to fetch batch at offset ${offset}:`, error.message)
      break
    }

    if (!subs || subs.length === 0) {
      console.log(`\n✓ No more subscriptions with v${FROM_VERSION} tokens.`)
      break
    }

    console.log(`Processing batch of ${subs.length} subscriptions (offset ${offset})…`)

    for (const sub of subs) {
      try {
        // Decrypt with old key
        const { data: plainToken, error: decryptError } = await supabase.rpc(
          "decrypt_payment_token",
          { encrypted_token: sub.payment_method_token, passphrase: fromKey }
        )
        if (decryptError) throw new Error(`Decrypt: ${decryptError.message}`)

        // Re-encrypt with new key
        const { data: newEncrypted, error: encryptError } = await supabase.rpc(
          "encrypt_payment_token",
          { plain_token: plainToken as string, passphrase: toKey }
        )
        if (encryptError) throw new Error(`Encrypt: ${encryptError.message}`)

        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from("subscriptions")
            .update({
              payment_method_token: newEncrypted as string,
              token_key_version: TO_VERSION,
            })
            .eq("id", sub.id)
            .eq("token_key_version", FROM_VERSION) // optimistic lock

          if (updateError) throw new Error(`Update: ${updateError.message}`)
        }

        totalRotated++
        process.stdout.write(".")
      } catch (err) {
        totalErrors++
        console.error(`\n❌ Failed to rotate token for ${sub.id}:`, (err as Error).message)
      }
    }

    offset += subs.length
    if (subs.length < BATCH_SIZE) break
  }

  console.log(`\n\nRotation complete:`)
  console.log(`  Rotated: ${totalRotated}`)
  console.log(`  Errors:  ${totalErrors}`)

  if (totalErrors > 0) {
    console.error("\n⚠️  Some tokens failed to rotate. Do NOT remove the old key yet.")
    process.exit(1)
  }

  if (!DRY_RUN) {
    console.log(`\n✓ All tokens rotated to v${TO_VERSION}.`)
    console.log(`  Next steps:`)
    console.log(`  1. Update TOKEN_ENCRYPTION_KEY in Railway to the new key value`)
    console.log(`  2. Remove TOKEN_ENCRYPTION_KEY_V2 from Railway env`)
    console.log(`  3. Update getEncryptionKey() in token-encryption.ts to reflect new version numbers`)
    console.log(`  4. Redeploy apps/api`)
  }
}

rotateTokens().catch((err) => {
  console.error("Fatal:", err.message)
  process.exit(1)
})
```

- [ ] **Step 2: Add script to apps/api/package.json**

In `apps/api/package.json` scripts section, add:
```json
"rotate-token-key": "FROM_VERSION=1 TO_VERSION=2 npx tsx scripts/rotate-token-key.ts",
"rotate-token-key:dry": "DRY_RUN=true FROM_VERSION=1 TO_VERSION=2 npx tsx scripts/rotate-token-key.ts"
```

- [ ] **Step 3: Document rotation procedure in script header comments**

The script already contains full step-by-step comments. Verify they match the token-encryption.ts `getEncryptionKey` branching logic before running.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/rotate-token-key.ts apps/api/package.json
git commit -m "feat(api): token key rotation script — zero-downtime re-encrypt with dual-key support"
```

---

## Task 9: Integration Smoke Test + Definition of Done

- [ ] **Step 1: Apply seed migration**

Paste `packages/db/migrations/0006_subscription_plans_seed.sql` into Supabase SQL Editor.
Expected: 3 rows inserted (or 0 if already present).

- [ ] **Step 2: Apply pgcrypto functions**

Paste the `encrypt_payment_token` / `decrypt_payment_token` SQL from Task 2 Step 3 into Supabase SQL Editor.
Expected: "Success. No rows returned"

- [ ] **Step 3: Start API + verify worker schedules**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npm run dev
```
Expected logs:
- `API server started on port 4000`
- `[subscription-billing] Daily billing job scheduled at 08:00 Asia/Taipei`
- `[email-sender] Worker started`

- [ ] **Step 4: Test subscription creation via API**

```bash
# First obtain a JWT from Supabase Auth (use seed admin or any test user)
TOKEN="<supabase-jwt>"
PLAN_ID=$(curl -s http://localhost:4000/api/subscriptions \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id // empty')

# Fetch a real plan ID from the DB
curl -s "http://localhost:4000/api/subscriptions" \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 5: Create a test subscription**

```bash
curl -s -X POST http://localhost:4000/api/subscriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planId":"<plan-uuid>","paymentToken":"TEST_TOK_DUMMY"}'
```
Expected: `{"data":{"id":"...","status":"active","next_billing_date":"..."}}`

- [ ] **Step 6: Verify token is encrypted in DB**

In Supabase SQL Editor:
```sql
SELECT id, status, payment_method_token, token_key_version
FROM subscriptions
ORDER BY created_at DESC LIMIT 1;
```
Expected: `payment_method_token` is a hex string (not the raw token), `token_key_version = 1`

- [ ] **Step 7: Test pause/resume/cancel**

```bash
SUB_ID="<subscription-uuid>"
curl -s -X PATCH "http://localhost:4000/api/subscriptions/$SUB_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"pause"}'
```
Expected: `{"data":{"id":"...","status":"paused",...}}`

- [ ] **Step 8: Verify subscription pages render**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npm run dev
```
- Open `http://localhost:3000/subscribe` — expect 3 plan cards
- Open `http://localhost:3000/my-account/subscriptions` (logged in) — expect subscription list
- Open `http://localhost:3000/my-account/subscriptions` (logged out) — expect redirect to `/auth/login`

- [ ] **Step 9: Run all unit tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal
npx turbo test
```
Expected: All tests PASS (web + api)

- [ ] **Step 10: TypeScript check**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npx tsc --noEmit
```
Expected: Zero errors

- [ ] **Step 11: Dry-run key rotation script**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
TOKEN_ENCRYPTION_KEY=test-key-32-chars-minimum-here \
TOKEN_ENCRYPTION_KEY_V2=new-key-32-chars-minimum-here \
npm run rotate-token-key:dry
```
Expected: Prints rotation plan, rotated count matches number of subscriptions with v1 tokens, no writes made.

---

## Definition of Done

- [ ] Supabase SQL Editor shows 3 rows in `subscription_plans` (月訂, 雙月, 月訂禮盒)
- [ ] `encrypt_payment_token` and `decrypt_payment_token` SQL functions exist in Supabase
- [ ] `POST /api/subscriptions` creates a subscription with `payment_method_token` stored as pgcrypto hex (never plaintext)
- [ ] `GET /api/subscriptions` returns user subscriptions without exposing `payment_method_token`
- [ ] `PATCH /api/subscriptions/:id` correctly sets `status` to `paused`, `active`, or `cancelled`
- [ ] BullMQ worker logs "Daily billing job scheduled at 08:00 Asia/Taipei" on API boot
- [ ] `buildIdempotencyKey` unit test passes — key format `sub_{id}_{YYYY-MM-DD}` in Taipei timezone
- [ ] `computeNextBillingDate` unit test passes — monthly +1 month, bimonthly +2 months
- [ ] Billing worker sets `status='past_due'` after `retry_count` reaches 3
- [ ] `subscription_orders` table has UNIQUE constraint on `idempotency_key` — verified by attempting duplicate insert
- [ ] `/subscribe` page renders plan cards for all 3 active plans
- [ ] `/my-account/subscriptions` redirects to `/auth/login` when unauthenticated
- [ ] `/my-account/subscriptions` shows pause/resume/cancel buttons matching subscription status
- [ ] PChomePay token webhook at `POST /api/webhooks/pchomepay-token` verifies SHA256 signature before processing
- [ ] `rotate-token-key.ts` dry-run completes without errors
- [ ] `npx turbo test` — all tests PASS
- [ ] `tsc --noEmit` — zero errors in `apps/api` and `apps/web`
