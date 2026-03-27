# Plan 4: Invoice & Tax — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Taiwan electronic invoice (電子發票) compliance end-to-end — Amego API integration, BullMQ issuance worker, checkout carrier selection UI, admin management, webhooks, customer invoice view, and monthly reconciliation.

**Architecture:** After payment confirmation (Plan 3), the `invoice-issuer` BullMQ worker calls the Amego (愛貝客) API to issue a 統一發票 and updates the `invoices` table. Webhooks from Amego confirm issuance/voidance. The frontend exposes carrier selection at checkout, invoice details in My Account, and an admin invoice management page.

**Tech Stack:** Express 5 (apps/api), BullMQ + Upstash Redis, Amego REST API, Next.js 15 App Router (apps/web), Drizzle ORM + Supabase PostgreSQL (packages/db), Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-realreal-rewrite-design.md`

**Depends on:** Plan 3 (Checkout + Payments) — orders must exist and payment must be confirmed before invoices can be issued.

---

## File Map

```
realreal/
├── packages/db/
│   └── src/schema/
│       └── payments.ts                          # invoices table — add carrier columns + migration
├── apps/api/
│   └── src/
│       ├── lib/
│       │   └── amego.ts                         # Amego API client (issue, void, query)
│       ├── workers/
│       │   └── invoice-issuer.ts                # BullMQ worker: issue invoice after payment
│       └── routes/
│           ├── invoices.ts                      # Admin routes: list, re-issue, void
│           └── webhooks/
│               └── amego.ts                     # Amego issued/voided webhook handler
└── apps/web/
    └── src/
        └── app/
            ├── checkout/
            │   └── _components/
            │       └── InvoiceSelector.tsx      # Carrier selection UI in checkout
            ├── admin/
            │   └── invoices/
            │       └── page.tsx                 # Admin invoice management
            └── my-account/
                └── orders/
                    └── [id]/
                        └── _components/
                            └── InvoiceCard.tsx  # Invoice details + QR code link
```

---

## Task 1: Invoice Data Model — Carrier Columns + Migration

**Files:**
- Modify: `packages/db/src/schema/payments.ts` — add carrier fields to `invoices` table
- Create: `packages/db/migrations/0004_invoice_carrier.sql`

The `invoices` table was created in Plan 1. This task extends it with carrier fields required for Taiwan e-invoice compliance.

- [ ] **Step 1: Update invoices Drizzle schema**

`packages/db/src/schema/payments.ts` — extend `invoices` table (replace existing definition):
```typescript
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  invoiceNumber: text("invoice_number"),          // e.g. AB-12345678 (assigned by Amego)
  randomCode: text("random_code"),                // 4-digit random code on physical invoice
  type: text("type").notNull(),                   // 'B2C_2' | 'B2C_3' | 'B2B'
  // B2C_3 carrier fields
  carrierType: text("carrier_type"),              // 'mobile' | 'citizen_cert' | 'love_code'
  carrierNumber: text("carrier_number"),          // encrypted mobile barcode or cert ID
  loveCode: text("love_code"),                    // 愛心碼 (charity donation code)
  // B2B fields
  taxId: text("tax_id"),                          // 統一編號 (8-digit)
  companyTitle: text("company_title"),
  // Financials
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // Amego tracking
  status: text("status").notNull().default("pending"), // pending | issued | voided | error
  amegoId: text("amego_id"),                      // Amego internal invoice ID
  amegoRawResponse: jsonb("amego_raw_response"),  // full Amego API response for audit
  errorMessage: text("error_message"),            // last error from Amego or worker
  retryCount: integer("retry_count").notNull().default(0),
  // Timestamps
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: Write migration SQL**

`packages/db/migrations/0004_invoice_carrier.sql`:
```sql
-- Add carrier and audit columns to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS random_code TEXT,
  ADD COLUMN IF NOT EXISTS carrier_type TEXT CHECK (carrier_type IN ('mobile','citizen_cert','love_code')),
  ADD COLUMN IF NOT EXISTS carrier_number TEXT,
  ADD COLUMN IF NOT EXISTS love_code TEXT,
  ADD COLUMN IF NOT EXISTS company_title TEXT,
  ADD COLUMN IF NOT EXISTS amego_raw_response JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Tighten type constraint
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_type_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_type_check CHECK (type IN ('B2C_2','B2C_3','B2B'));

-- Tighten status constraint
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check CHECK (status IN ('pending','issued','voided','error'));

-- Index for admin invoice list queries
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
```

- [ ] **Step 3: Apply migration in Supabase SQL Editor**

Paste `0004_invoice_carrier.sql` into Supabase Dashboard → SQL Editor → Run.
Expected: "Success. No rows returned"

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/payments.ts packages/db/migrations/0004_invoice_carrier.sql
git commit -m "feat(db): extend invoices table with carrier, audit, and retry columns"
```

---

## Task 2: Amego API Client

**Files:**
- Create: `apps/api/src/lib/amego.ts`
- Create: `apps/api/src/lib/__tests__/amego.test.ts`

The Amego (愛貝客電子發票) REST API issues, voids, and queries Taiwan e-invoices. The client wraps all three operations with Zod validation, retry-on-rate-limit (429), and structured error types.

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install axios axios-retry zod
```

- [ ] **Step 2: Write failing tests**

`apps/api/src/lib/__tests__/amego.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import axios from "axios"

vi.mock("axios")
const mockedAxios = vi.mocked(axios, true)

// Reset module so env vars are injected
vi.stubEnv("AMEGO_TAX_ID", "60515111")
vi.stubEnv("AMEGO_APP_KEY", "test-app-key")

const { issueInvoice, voidInvoice, queryInvoice } = await import("../amego")

describe("issueInvoice", () => {
  beforeEach(() => vi.clearAllMocks())

  it("throws AmegoError on API error response", async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { success: false, message: "Invalid merchant" },
    })
    await expect(
      issueInvoice({
        orderId: "order-1",
        type: "B2C_2",
        amount: 1000,
        taxAmount: 50,
        buyerEmail: "buyer@example.com",
        items: [{ name: "Product A", qty: 1, unitPrice: 1000, amount: 1000 }],
      })
    ).rejects.toThrow("Invalid merchant")
  })

  it("returns invoice data on success", async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: {
        success: true,
        invoiceNumber: "AB-12345678",
        randomCode: "1234",
        amegoId: "amg-001",
      },
    })
    const result = await issueInvoice({
      orderId: "order-1",
      type: "B2C_2",
      amount: 1000,
      taxAmount: 50,
      buyerEmail: "buyer@example.com",
      items: [{ name: "Product A", qty: 1, unitPrice: 1000, amount: 1000 }],
    })
    expect(result.invoiceNumber).toBe("AB-12345678")
    expect(result.randomCode).toBe("1234")
  })
})

describe("voidInvoice", () => {
  it("calls void endpoint with invoiceNumber", async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({
      data: { success: true },
    })
    await voidInvoice({ invoiceNumber: "AB-12345678", reason: "Customer request" })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/void"),
      expect.objectContaining({ invoiceNumber: "AB-12345678" }),
      expect.anything()
    )
  })
})

describe("queryInvoice", () => {
  it("returns invoice status", async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: { success: true, status: "issued", invoiceNumber: "AB-12345678" },
    })
    const result = await queryInvoice("AB-12345678")
    expect(result.status).toBe("issued")
  })
})
```

- [ ] **Step 3: Write Amego client**

`apps/api/src/lib/amego.ts`:
```typescript
import axios from "axios"
import axiosRetry from "axios-retry"
import { z } from "zod"

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.AMEGO_BASE_URL ?? "https://api.amego.com.tw/v1"
const TAX_ID = process.env.AMEGO_TAX_ID!        // 愛貝客商店統一編號: 60515111
const APP_KEY = process.env.AMEGO_APP_KEY!

const client = axios.create({ baseURL: BASE_URL, timeout: 15_000 })

// Retry on network errors and 429 Too Many Requests
axiosRetry(client, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000,
  retryCondition: (err) =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) ||
    err.response?.status === 429,
})

// ── Error ───────────────────────────────────────────────────────────────────

export class AmegoError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly raw?: unknown
  ) {
    super(message)
    this.name = "AmegoError"
  }
}

// ── Shared auth headers ─────────────────────────────────────────────────────

function authHeaders() {
  return {
    "X-Tax-ID": TAX_ID,
    "X-App-Key": APP_KEY,
    "Content-Type": "application/json",
  }
}

// ── Issue invoice ───────────────────────────────────────────────────────────

export const IssueInvoiceInputSchema = z.object({
  orderId: z.string(),
  type: z.enum(["B2C_2", "B2C_3", "B2B"]),
  amount: z.number().positive(),
  taxAmount: z.number().nonnegative(),
  buyerEmail: z.string().email().optional(),
  // B2C_3
  carrierType: z.enum(["mobile", "citizen_cert", "love_code"]).optional(),
  carrierNumber: z.string().optional(),
  loveCode: z.string().optional(),
  // B2B
  taxId: z.string().length(8).optional(),
  companyTitle: z.string().optional(),
  items: z.array(z.object({
    name: z.string(),
    qty: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    amount: z.number().nonnegative(),
  })),
})

export type IssueInvoiceInput = z.infer<typeof IssueInvoiceInputSchema>

export interface IssueInvoiceResult {
  invoiceNumber: string
  randomCode: string
  amegoId: string
  raw: unknown
}

export async function issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
  const validated = IssueInvoiceInputSchema.parse(input)
  const payload = {
    merchantOrderId: validated.orderId,
    invoiceType: validated.type,
    salesAmount: validated.amount,
    taxAmount: validated.taxAmount,
    buyerEmail: validated.buyerEmail,
    carrierType: validated.carrierType,
    carrierNumber: validated.carrierNumber,
    loveCode: validated.loveCode,
    buyerTaxId: validated.taxId,
    buyerTitle: validated.companyTitle,
    items: validated.items,
  }
  const { data } = await client.post("/invoice/issue", payload, {
    headers: authHeaders(),
  })
  if (!data.success) {
    throw new AmegoError(data.message ?? "Amego issue failed", data.code, data)
  }
  return {
    invoiceNumber: data.invoiceNumber,
    randomCode: data.randomCode,
    amegoId: data.amegoId,
    raw: data,
  }
}

// ── Void invoice ────────────────────────────────────────────────────────────

export interface VoidInvoiceInput {
  invoiceNumber: string
  reason: string
}

export async function voidInvoice(input: VoidInvoiceInput): Promise<void> {
  const { data } = await client.post(
    "/invoice/void",
    { invoiceNumber: input.invoiceNumber, voidReason: input.reason },
    { headers: authHeaders() }
  )
  if (!data.success) {
    throw new AmegoError(data.message ?? "Amego void failed", data.code, data)
  }
}

// ── Query invoice ───────────────────────────────────────────────────────────

export interface InvoiceStatusResult {
  status: "issued" | "voided" | "pending"
  invoiceNumber: string
  raw: unknown
}

export async function queryInvoice(invoiceNumber: string): Promise<InvoiceStatusResult> {
  const { data } = await client.get(`/invoice/${encodeURIComponent(invoiceNumber)}`, {
    headers: authHeaders(),
  })
  if (!data.success) {
    throw new AmegoError(data.message ?? "Amego query failed", data.code, data)
  }
  return { status: data.status, invoiceNumber: data.invoiceNumber, raw: data }
}

// ── PDF URL helper ──────────────────────────────────────────────────────────

export function invoicePdfUrl(invoiceNumber: string): string {
  return `${BASE_URL}/invoice/${encodeURIComponent(invoiceNumber)}/pdf?taxId=${TAX_ID}&appKey=${APP_KEY}`
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx vitest run src/lib/__tests__/amego.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/amego.ts apps/api/src/lib/__tests__/amego.test.ts
git commit -m "feat(api): Amego e-invoice API client — issue, void, query with retry on 429"
```

---

## Task 3: BullMQ Invoice-Issuer Worker

**Files:**
- Create: `apps/api/src/workers/invoice-issuer.ts`
- Create: `apps/api/src/workers/__tests__/invoice-issuer.test.ts`

The worker is enqueued by the payment-confirmed event (Plan 3). It reads the order's invoice metadata, calls Amego, and updates the `invoices` table. Failed jobs are retried up to 5 times with exponential backoff before marking the invoice as `error`.

- [ ] **Step 1: Install BullMQ (if not already from Plan 3)**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install bullmq @upstash/redis ioredis
```

- [ ] **Step 2: Write failing tests**

`apps/api/src/workers/__tests__/invoice-issuer.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockIssueInvoice = vi.fn()
vi.mock("../../lib/amego", () => ({ issueInvoice: mockIssueInvoice }))

const mockFrom = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()

vi.mock("../../lib/supabase", () => ({
  adminClient: {
    from: mockFrom,
  },
}))

const { processInvoiceJob } = await import("../invoice-issuer")

const baseJob = {
  data: {
    invoiceId: "inv-001",
    orderId: "order-001",
    type: "B2C_2",
    amount: 1000,
    taxAmount: 50,
    buyerEmail: "buyer@test.com",
    items: [{ name: "Product A", qty: 1, unitPrice: 1000, amount: 1000 }],
  },
  attemptsMade: 0,
}

describe("processInvoiceJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
  })

  it("issues invoice and updates status to 'issued'", async () => {
    mockIssueInvoice.mockResolvedValue({
      invoiceNumber: "AB-12345678",
      randomCode: "1234",
      amegoId: "amg-001",
      raw: {},
    })
    await processInvoiceJob(baseJob as any)
    expect(mockIssueInvoice).toHaveBeenCalledOnce()
    expect(mockFrom).toHaveBeenCalledWith("invoices")
  })

  it("updates status to 'error' and rethrows on AmegoError", async () => {
    const { AmegoError } = await import("../../lib/amego")
    mockIssueInvoice.mockRejectedValue(new AmegoError("Invalid merchant"))
    await expect(processInvoiceJob(baseJob as any)).rejects.toThrow("Invalid merchant")
  })

  it("increments retry_count on each attempt", async () => {
    const { AmegoError } = await import("../../lib/amego")
    mockIssueInvoice.mockRejectedValue(new AmegoError("Timeout"))
    const jobWithRetry = { ...baseJob, attemptsMade: 2 }
    await expect(processInvoiceJob(jobWithRetry as any)).rejects.toThrow()
    const updateCall = mockFrom.mock.results[0]?.value?.update
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ retry_count: 2 }))
  })
})
```

- [ ] **Step 3: Write invoice-issuer worker**

`apps/api/src/workers/invoice-issuer.ts`:
```typescript
import { Worker, Queue, Job } from "bullmq"
import { issueInvoice, AmegoError } from "../lib/amego"
import { adminClient } from "../lib/supabase"
import pino from "pino"

const logger = pino({ name: "invoice-issuer" })

// ── Queue ───────────────────────────────────────────────────────────────────

export const invoiceQueue = new Queue("invoice-issuer", {
  connection: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

// ── Job payload type ─────────────────────────────────────────────────────────

export interface InvoiceJobData {
  invoiceId: string
  orderId: string
  type: "B2C_2" | "B2C_3" | "B2B"
  amount: number
  taxAmount: number
  buyerEmail?: string
  carrierType?: "mobile" | "citizen_cert" | "love_code"
  carrierNumber?: string
  loveCode?: string
  taxId?: string
  companyTitle?: string
  items: Array<{ name: string; qty: number; unitPrice: number; amount: number }>
}

// ── Processor (exported for unit-testing without BullMQ runtime) ─────────────

export async function processInvoiceJob(job: Job<InvoiceJobData>): Promise<void> {
  const { invoiceId, orderId, type, amount, taxAmount, buyerEmail,
          carrierType, carrierNumber, loveCode, taxId, companyTitle, items } = job.data

  logger.info({ invoiceId, orderId, attempt: job.attemptsMade }, "Processing invoice job")

  try {
    const result = await issueInvoice({
      orderId,
      type,
      amount,
      taxAmount,
      buyerEmail,
      carrierType,
      carrierNumber,
      loveCode,
      taxId,
      companyTitle,
      items,
    })

    const { error } = await adminClient
      .from("invoices")
      .update({
        invoice_number: result.invoiceNumber,
        random_code: result.randomCode,
        amego_id: result.amegoId,
        amego_raw_response: result.raw,
        status: "issued",
        issued_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", invoiceId)

    if (error) throw new Error(`DB update failed: ${error.message}`)

    logger.info({ invoiceId, invoiceNumber: result.invoiceNumber }, "Invoice issued successfully")
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ invoiceId, err: message, attempt: job.attemptsMade }, "Invoice job failed")

    // Always record the latest error and retry count regardless of whether we rethrow
    await adminClient
      .from("invoices")
      .update({
        retry_count: job.attemptsMade,
        error_message: message,
        // Only set final error status on last attempt
        ...(job.attemptsMade >= 4 ? { status: "error" } : {}),
      })
      .eq("id", invoiceId)

    throw err  // Let BullMQ handle retry
  }
}

// ── Worker ───────────────────────────────────────────────────────────────────

export function startInvoiceWorker() {
  const worker = new Worker<InvoiceJobData>("invoice-issuer", processInvoiceJob, {
    connection: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_TLS === "true" ? {} : undefined,
    },
    concurrency: 5,
  })

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id }, "Invoice job completed")
  )
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "Invoice job permanently failed")
  )

  return worker
}
```

- [ ] **Step 4: Register worker in apps/api/src/index.ts**

In `apps/api/src/index.ts`, add after the server starts:
```typescript
import { startInvoiceWorker } from "./workers/invoice-issuer"
// ...
startInvoiceWorker()
logger.info("Invoice-issuer worker started")
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx vitest run src/workers/__tests__/invoice-issuer.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workers/invoice-issuer.ts apps/api/src/workers/__tests__/invoice-issuer.test.ts apps/api/src/index.ts
git commit -m "feat(api): BullMQ invoice-issuer worker — issues Amego invoice after payment, retries 5x"
```

---

## Task 4: Invoice Selection UI in Checkout

**Files:**
- Create: `apps/web/src/app/checkout/_components/InvoiceSelector.tsx`

The `InvoiceSelector` component is embedded in the checkout flow (Plan 3). It collects carrier preferences and saves them to the order's `metadata.invoice` JSON. Three invoice types are supported: B2C_2 (雲端發票 — cloud storage), B2C_3 (載具 — carrier barcode or cert), B2B (統編 — business tax ID).

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx shadcn@latest add select radio-group
```

- [ ] **Step 2: Write InvoiceSelector component**

`apps/web/src/app/checkout/_components/InvoiceSelector.tsx`:
```typescript
"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type InvoiceType = "B2C_2" | "B2C_3" | "B2B"
export type CarrierType = "mobile" | "citizen_cert" | "love_code"

export interface InvoiceSelection {
  type: InvoiceType
  carrierType?: CarrierType
  carrierNumber?: string
  loveCode?: string
  taxId?: string
  companyTitle?: string
}

interface Props {
  value: InvoiceSelection
  onChange: (v: InvoiceSelection) => void
}

export function InvoiceSelector({ value, onChange }: Props) {
  const [type, setType] = useState<InvoiceType>(value.type ?? "B2C_2")
  const [carrierType, setCarrierType] = useState<CarrierType>(value.carrierType ?? "mobile")
  const [carrierNumber, setCarrierNumber] = useState(value.carrierNumber ?? "")
  const [loveCode, setLoveCode] = useState(value.loveCode ?? "")
  const [taxId, setTaxId] = useState(value.taxId ?? "")
  const [companyTitle, setCompanyTitle] = useState(value.companyTitle ?? "")

  function emit(patch: Partial<InvoiceSelection>) {
    const next: InvoiceSelection = {
      type,
      carrierType,
      carrierNumber,
      loveCode,
      taxId,
      companyTitle,
      ...patch,
    }
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <p className="font-medium text-sm">發票開立方式</p>

      <RadioGroup
        value={type}
        onValueChange={(v) => {
          setType(v as InvoiceType)
          emit({ type: v as InvoiceType })
        }}
        className="space-y-2"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="B2C_2" id="inv-cloud" />
          <Label htmlFor="inv-cloud">雲端發票（存入會員載具）</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="B2C_3" id="inv-carrier" />
          <Label htmlFor="inv-carrier">載具歸戶</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="B2B" id="inv-b2b" />
          <Label htmlFor="inv-b2b">公司統編（三聯式）</Label>
        </div>
      </RadioGroup>

      {type === "B2C_3" && (
        <div className="space-y-3 pl-6 border-l ml-3">
          <div className="space-y-1">
            <Label>載具類型</Label>
            <Select
              value={carrierType}
              onValueChange={(v) => {
                setCarrierType(v as CarrierType)
                emit({ carrierType: v as CarrierType })
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile">手機條碼</SelectItem>
                <SelectItem value="citizen_cert">自然人憑證</SelectItem>
                <SelectItem value="love_code">愛心碼</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {carrierType === "love_code" ? (
            <div className="space-y-1">
              <Label htmlFor="love-code">愛心碼</Label>
              <Input
                id="love-code"
                placeholder="例：001"
                value={loveCode}
                onChange={(e) => {
                  setLoveCode(e.target.value)
                  emit({ loveCode: e.target.value })
                }}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="carrier-number">
                {carrierType === "mobile" ? "手機條碼" : "自然人憑證號碼"}
              </Label>
              <Input
                id="carrier-number"
                placeholder={carrierType === "mobile" ? "/XXXXXXX" : "輸入憑證號碼"}
                value={carrierNumber}
                onChange={(e) => {
                  setCarrierNumber(e.target.value)
                  emit({ carrierNumber: e.target.value })
                }}
              />
            </div>
          )}
        </div>
      )}

      {type === "B2B" && (
        <div className="space-y-3 pl-6 border-l ml-3">
          <div className="space-y-1">
            <Label htmlFor="tax-id">統一編號</Label>
            <Input
              id="tax-id"
              placeholder="8位數字"
              maxLength={8}
              value={taxId}
              onChange={(e) => {
                setTaxId(e.target.value)
                emit({ taxId: e.target.value })
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="company-title">公司抬頭</Label>
            <Input
              id="company-title"
              placeholder="公司全名"
              value={companyTitle}
              onChange={(e) => {
                setCompanyTitle(e.target.value)
                emit({ companyTitle: e.target.value })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Integrate InvoiceSelector in checkout form**

In the checkout page (`apps/web/src/app/checkout/page.tsx`, created in Plan 3), import and render `<InvoiceSelector>` inside the order form, storing the result in state:
```typescript
import { InvoiceSelector, InvoiceSelection } from "./_components/InvoiceSelector"

// In component state:
const [invoiceSelection, setInvoiceSelection] = useState<InvoiceSelection>({ type: "B2C_2" })

// In form submit handler, add to payload:
metadata: { invoice: invoiceSelection }

// In JSX, before the submit button:
<InvoiceSelector value={invoiceSelection} onChange={setInvoiceSelection} />
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/checkout/_components/InvoiceSelector.tsx apps/web/src/app/checkout/page.tsx
git commit -m "feat(web): invoice carrier selection UI — B2C_2/B2C_3/B2B with mobile barcode, cert, love code"
```

---

## Task 5: Admin Invoice Management

**Files:**
- Create: `apps/api/src/routes/invoices.ts`
- Create: `apps/web/src/app/admin/invoices/page.tsx`

Admins can view all invoices, filter by status, manually re-issue failed invoices, void issued invoices, and download the PDF via Amego's PDF URL.

- [ ] **Step 1: Write admin invoice API routes**

`apps/api/src/routes/invoices.ts`:
```typescript
import { Router } from "express"
import { z } from "zod"
import { adminClient } from "../lib/supabase"
import { voidInvoice, invoicePdfUrl, AmegoError } from "../lib/amego"
import { invoiceQueue } from "../workers/invoice-issuer"
import { requireAdmin } from "../middleware/admin"

const router = Router()
router.use(requireAdmin)

// GET /invoices — list with optional status/date filters
router.get("/", async (req, res, next) => {
  try {
    const { status, from, to, page = "1", limit = "20" } = req.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)

    let query = adminClient
      .from("invoices")
      .select("*, orders(order_number, total_amount, user_id)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + Number(limit) - 1)

    if (status) query = query.eq("status", status)
    if (from) query = query.gte("created_at", from)
    if (to) query = query.lte("created_at", to)

    const { data, error, count } = await query
    if (error) throw error

    res.json({ invoices: data, total: count, page: Number(page), limit: Number(limit) })
  } catch (err) { next(err) }
})

// POST /invoices/:id/reissue — re-enqueue a failed invoice
router.post("/:id/reissue", async (req, res, next) => {
  try {
    const { data: inv, error } = await adminClient
      .from("invoices")
      .select("*, orders(id, metadata, total_amount)")
      .eq("id", req.params.id)
      .single()

    if (error || !inv) return res.status(404).json({ error: "Invoice not found" })
    if (inv.status === "issued") return res.status(409).json({ error: "Invoice already issued" })

    // Reset to pending before re-enqueueing
    await adminClient
      .from("invoices")
      .update({ status: "pending", error_message: null, retry_count: 0 })
      .eq("id", inv.id)

    const invoiceMeta = inv.orders?.metadata?.invoice ?? {}
    await invoiceQueue.add("reissue", {
      invoiceId: inv.id,
      orderId: inv.order_id,
      type: inv.type,
      amount: Number(inv.amount),
      taxAmount: Number(inv.tax_amount),
      buyerEmail: invoiceMeta.buyerEmail,
      carrierType: invoiceMeta.carrierType,
      carrierNumber: invoiceMeta.carrierNumber,
      loveCode: invoiceMeta.loveCode,
      taxId: inv.tax_id,
      companyTitle: invoiceMeta.companyTitle,
      items: invoiceMeta.items ?? [],
    })

    res.json({ ok: true, message: "Invoice re-enqueued" })
  } catch (err) { next(err) }
})

// POST /invoices/:id/void — void an issued invoice
router.post("/:id/void", async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body)

    const { data: inv, error } = await adminClient
      .from("invoices")
      .select("invoice_number, status")
      .eq("id", req.params.id)
      .single()

    if (error || !inv) return res.status(404).json({ error: "Invoice not found" })
    if (inv.status !== "issued") return res.status(409).json({ error: "Only issued invoices can be voided" })
    if (!inv.invoice_number) return res.status(409).json({ error: "No invoice number on record" })

    await voidInvoice({ invoiceNumber: inv.invoice_number, reason })
    await adminClient
      .from("invoices")
      .update({ status: "voided", voided_at: new Date().toISOString() })
      .eq("id", req.params.id)

    res.json({ ok: true })
  } catch (err) {
    if (err instanceof AmegoError) return res.status(502).json({ error: err.message })
    next(err)
  }
})

// GET /invoices/:id/pdf — redirect to Amego PDF URL
router.get("/:id/pdf", async (req, res, next) => {
  try {
    const { data: inv, error } = await adminClient
      .from("invoices")
      .select("invoice_number, status")
      .eq("id", req.params.id)
      .single()

    if (error || !inv) return res.status(404).json({ error: "Invoice not found" })
    if (!inv.invoice_number) return res.status(409).json({ error: "Invoice not yet issued" })

    res.redirect(302, invoicePdfUrl(inv.invoice_number))
  } catch (err) { next(err) }
})

export default router
```

- [ ] **Step 2: Register invoices router in apps/api/src/app.ts**

```typescript
import invoicesRouter from "./routes/invoices"
// ...
app.use("/invoices", invoicesRouter)
```

- [ ] **Step 3: Write admin invoices page**

`apps/web/src/app/admin/invoices/page.tsx`:
```typescript
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const STATUS_LABELS: Record<string, string> = {
  pending: "待開立",
  issued: "已開立",
  voided: "已作廢",
  error: "開立失敗",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  issued: "default",
  voided: "outline",
  error: "destructive",
}

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const { status, page = "1" } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from("invoices")
    .select("id, invoice_number, type, amount, status, issued_at, voided_at, error_message, orders(order_number)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((Number(page) - 1) * 20, Number(page) * 20 - 1)

  if (status) query = query.eq("status", status)

  const { data: invoices, count } = await query

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">發票管理</h1>
        <p className="text-sm text-muted-foreground">共 {count ?? 0} 筆</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2">
        {["", "pending", "issued", "voided", "error"].map((s) => (
          <a
            key={s}
            href={`/admin/invoices${s ? `?status=${s}` : ""}`}
            className={`px-3 py-1 rounded-md text-sm border ${status === s || (!status && !s) ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {s ? STATUS_LABELS[s] : "全部"}
          </a>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left">發票號碼</th>
              <th className="px-4 py-3 text-left">訂單號</th>
              <th className="px-4 py-3 text-left">類型</th>
              <th className="px-4 py-3 text-right">金額</th>
              <th className="px-4 py-3 text-left">狀態</th>
              <th className="px-4 py-3 text-left">開立時間</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {invoices?.map((inv) => (
              <tr key={inv.id} className="border-t">
                <td className="px-4 py-3 font-mono">{inv.invoice_number ?? "—"}</td>
                <td className="px-4 py-3">{(inv.orders as any)?.order_number ?? "—"}</td>
                <td className="px-4 py-3">{inv.type}</td>
                <td className="px-4 py-3 text-right">NT$ {Number(inv.amount).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[inv.status] ?? "secondary"}>
                    {STATUS_LABELS[inv.status] ?? inv.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString("zh-TW") : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {inv.status === "issued" && inv.invoice_number && (
                      <a
                        href={`/api/admin/invoices/${inv.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        PDF
                      </a>
                    )}
                    {(inv.status === "error" || inv.status === "pending") && (
                      <form action={`/api/admin/invoices/${inv.id}/reissue`} method="POST">
                        <Button type="submit" size="sm" variant="outline" className="text-xs h-7">
                          重新開立
                        </Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(!invoices || invoices.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  無發票資料
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/invoices.ts apps/api/src/app.ts apps/web/src/app/admin/invoices/page.tsx
git commit -m "feat: admin invoice management — list, re-issue, void, PDF download"
```

---

## Task 6: Amego Invoice Webhook

**Files:**
- Create: `apps/api/src/routes/webhooks/amego.ts`
- Create: `apps/api/src/routes/webhooks/__tests__/amego.test.ts`

Amego calls our webhook when an invoice is issued or voided. We verify the request signature, update the `invoices` table, and return HTTP 200. Idempotency is enforced — duplicate callbacks for the same `amegoId` are silently accepted.

- [ ] **Step 1: Write failing tests**

`apps/api/src/routes/webhooks/__tests__/amego.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import supertest from "supertest"
import { app } from "../../../app"
import crypto from "crypto"

vi.stubEnv("AMEGO_WEBHOOK_SECRET", "test-webhook-secret")

const mockFrom = vi.fn()
vi.mock("../../../lib/supabase", () => ({
  adminClient: { from: mockFrom },
}))

function makeSignature(body: string) {
  return crypto.createHmac("sha256", "test-webhook-secret").update(body).digest("hex")
}

describe("POST /webhooks/amego", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "inv-001", status: "pending" }, error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
  })

  it("returns 401 for missing signature", async () => {
    const res = await supertest(app)
      .post("/webhooks/amego")
      .send({ event: "invoice.issued" })
    expect(res.status).toBe(401)
  })

  it("returns 401 for invalid signature", async () => {
    const res = await supertest(app)
      .post("/webhooks/amego")
      .set("X-Amego-Signature", "bad-signature")
      .send({ event: "invoice.issued" })
    expect(res.status).toBe(401)
  })

  it("processes invoice.issued event and returns 200", async () => {
    const body = JSON.stringify({
      event: "invoice.issued",
      amegoId: "amg-001",
      invoiceNumber: "AB-12345678",
      randomCode: "1234",
      issuedAt: "2026-03-27T10:00:00Z",
    })
    const sig = makeSignature(body)
    const res = await supertest(app)
      .post("/webhooks/amego")
      .set("X-Amego-Signature", sig)
      .set("Content-Type", "application/json")
      .send(body)
    expect(res.status).toBe(200)
  })

  it("returns 200 for unknown event (no-op)", async () => {
    const body = JSON.stringify({ event: "invoice.unknown" })
    const sig = makeSignature(body)
    const res = await supertest(app)
      .post("/webhooks/amego")
      .set("X-Amego-Signature", sig)
      .set("Content-Type", "application/json")
      .send(body)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Write Amego webhook handler**

`apps/api/src/routes/webhooks/amego.ts`:
```typescript
import { Router } from "express"
import crypto from "crypto"
import { adminClient } from "../../lib/supabase"

const router = Router()

// Raw body needed for HMAC verification — mount before express.json()
router.use(express.raw({ type: "application/json" }))

function verifySignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.AMEGO_WEBHOOK_SECRET
  if (!secret) return false
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

router.post("/", async (req, res) => {
  const signature = req.headers["x-amego-signature"] as string | undefined

  if (!signature || !verifySignature(req.body as Buffer, signature)) {
    return res.status(401).json({ error: "Invalid signature" })
  }

  const event = JSON.parse((req.body as Buffer).toString())

  if (event.event === "invoice.issued") {
    const { amegoId, invoiceNumber, randomCode, issuedAt } = event

    // Idempotency: check if already processed
    const { data: existing } = await adminClient
      .from("invoices")
      .select("id, status")
      .eq("amego_id", amegoId)
      .single()

    if (existing && existing.status === "issued") {
      return res.json({ ok: true, message: "Already processed" })
    }

    if (existing) {
      await adminClient
        .from("invoices")
        .update({
          invoice_number: invoiceNumber,
          random_code: randomCode,
          status: "issued",
          issued_at: issuedAt ?? new Date().toISOString(),
        })
        .eq("id", existing.id)
    }
  } else if (event.event === "invoice.voided") {
    const { amegoId, voidedAt } = event

    const { data: existing } = await adminClient
      .from("invoices")
      .select("id, status")
      .eq("amego_id", amegoId)
      .single()

    if (existing && existing.status !== "voided") {
      await adminClient
        .from("invoices")
        .update({ status: "voided", voided_at: voidedAt ?? new Date().toISOString() })
        .eq("id", existing.id)
    }
  }
  // Unknown events: silently accept (no-op)

  res.json({ ok: true })
})

export default router
```

- [ ] **Step 3: Register webhook route in apps/api/src/app.ts**

The Amego webhook route must be mounted BEFORE the global `express.json()` middleware so the raw body is preserved for HMAC verification:
```typescript
import amegoWebhookRouter from "./routes/webhooks/amego"
// Mount BEFORE express.json():
app.use("/webhooks/amego", amegoWebhookRouter)
// Then the global JSON parser:
app.use(express.json())
```

- [ ] **Step 4: Add AMEGO_WEBHOOK_SECRET to env**

Add to `apps/api/.env.example`:
```bash
AMEGO_WEBHOOK_SECRET=          # Amego dashboard → Webhook → Secret
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx vitest run src/routes/webhooks/__tests__/amego.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/webhooks/ apps/api/src/app.ts apps/api/.env.example
git commit -m "feat(api): Amego webhook handler — invoice.issued/voided with HMAC verification and idempotency"
```

---

## Task 7: My Account Invoice View

**Files:**
- Create: `apps/web/src/app/my-account/orders/[id]/_components/InvoiceCard.tsx`

The order detail page (Plan 3) shows an `InvoiceCard` component with the invoice number, type, carrier info, QR code link to Amego's public verification URL, and status badge.

- [ ] **Step 1: Write InvoiceCard component**

`apps/web/src/app/my-account/orders/[id]/_components/InvoiceCard.tsx`:
```typescript
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Invoice {
  id: string
  invoice_number: string | null
  random_code: string | null
  type: string
  carrier_type: string | null
  carrier_number: string | null
  love_code: string | null
  tax_id: string | null
  company_title: string | null
  amount: string
  status: string
  issued_at: string | null
}

const TYPE_LABELS: Record<string, string> = {
  B2C_2: "雲端發票",
  B2C_3: "載具發票",
  B2B: "公司統編",
}

const CARRIER_LABELS: Record<string, string> = {
  mobile: "手機條碼",
  citizen_cert: "自然人憑證",
  love_code: "愛心碼",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  issued: "default",
  voided: "outline",
  error: "destructive",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "開立中",
  issued: "已開立",
  voided: "已作廢",
  error: "開立失敗",
}

// Taiwan e-invoice public verification base URL
function invoiceVerifyUrl(invoiceNumber: string, randomCode: string) {
  return `https://www.einvoice.nat.gov.tw/BIZAPIVAN/pub?action=qryInvDetail&invNum=${invoiceNumber}&randomNumber=${randomCode}`
}

export function InvoiceCard({ invoice }: { invoice: Invoice }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">電子發票</CardTitle>
          <Badge variant={STATUS_VARIANT[invoice.status] ?? "secondary"}>
            {STATUS_LABELS[invoice.status] ?? invoice.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">發票類型</span>
          <span>{TYPE_LABELS[invoice.type] ?? invoice.type}</span>
        </div>

        {invoice.invoice_number && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">發票號碼</span>
            <span className="font-mono">{invoice.invoice_number}</span>
          </div>
        )}

        {invoice.issued_at && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">開立日期</span>
            <span>{new Date(invoice.issued_at).toLocaleDateString("zh-TW")}</span>
          </div>
        )}

        {invoice.type === "B2C_3" && invoice.carrier_type && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">載具類型</span>
            <span>{CARRIER_LABELS[invoice.carrier_type] ?? invoice.carrier_type}</span>
          </div>
        )}

        {invoice.love_code && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">愛心碼</span>
            <span>{invoice.love_code}</span>
          </div>
        )}

        {invoice.type === "B2B" && invoice.tax_id && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">統一編號</span>
              <span className="font-mono">{invoice.tax_id}</span>
            </div>
            {invoice.company_title && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">公司抬頭</span>
                <span>{invoice.company_title}</span>
              </div>
            )}
          </>
        )}

        <div className="flex justify-between">
          <span className="text-muted-foreground">發票金額</span>
          <span>NT$ {Number(invoice.amount).toLocaleString()}</span>
        </div>

        {invoice.invoice_number && invoice.random_code && invoice.status === "issued" && (
          <a
            href={invoiceVerifyUrl(invoice.invoice_number, invoice.random_code)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center mt-3 text-xs text-blue-600 underline"
          >
            查詢發票（財政部電子發票平台）
          </a>
        )}

        {invoice.status === "pending" && (
          <p className="text-xs text-muted-foreground mt-2">
            發票開立中，通常於付款後數分鐘內完成。
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Integrate InvoiceCard in order detail page**

In `apps/web/src/app/my-account/orders/[id]/page.tsx` (Plan 3), query the invoice and render the card:
```typescript
import { InvoiceCard } from "./_components/InvoiceCard"

// In the Server Component, after fetching the order:
const { data: invoice } = await supabase
  .from("invoices")
  .select("*")
  .eq("order_id", order.id)
  .maybeSingle()

// In JSX:
{invoice && <InvoiceCard invoice={invoice} />}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/my-account/orders/
git commit -m "feat(web): InvoiceCard in order detail — invoice number, carrier, QR verify link"
```

---

## Task 8: Monthly Invoice Reconciliation Worker

**Files:**
- Create: `apps/api/src/workers/invoice-reconciler.ts`

A BullMQ cron job runs on the 1st of each month at 09:00 Taipei time. It fetches all invoices from the previous month with `status = 'pending'` or `status = 'error'` and logs an alert for each. In production, this sends an email alert (via SMTP) to the admin for manual review.

- [ ] **Step 1: Install node-cron for scheduling (if not already present)**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install node-cron
npm install --save-dev @types/node-cron
```

- [ ] **Step 2: Write reconciliation worker**

`apps/api/src/workers/invoice-reconciler.ts`:
```typescript
import cron from "node-cron"
import { adminClient } from "../lib/supabase"
import pino from "pino"

const logger = pino({ name: "invoice-reconciler" })

// ── Reconcile function (exported for testing) ────────────────────────────────

export async function reconcilePreviousMonth(): Promise<{
  failed: number
  pending: number
  invoiceIds: string[]
}> {
  const now = new Date()
  // Previous month range
  const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const from = firstOfPrevMonth.toISOString()
  const to = firstOfThisMonth.toISOString()

  const { data: failedInvoices, error } = await adminClient
    .from("invoices")
    .select("id, order_id, status, amount, error_message, created_at")
    .in("status", ["pending", "error"])
    .gte("created_at", from)
    .lt("created_at", to)

  if (error) {
    logger.error({ error: error.message }, "Reconciliation query failed")
    throw error
  }

  const failed = failedInvoices?.filter((i) => i.status === "error").length ?? 0
  const pending = failedInvoices?.filter((i) => i.status === "pending").length ?? 0
  const invoiceIds = failedInvoices?.map((i) => i.id) ?? []

  if (invoiceIds.length > 0) {
    logger.warn(
      { from, to, failed, pending, invoiceIds },
      "RECONCILIATION ALERT: uninvoiced orders found from previous month"
    )
    // In production: send email alert via SMTP
    // await sendReconciliationAlert({ month: from, failed, pending, invoiceIds })
  } else {
    logger.info({ from, to }, "Reconciliation OK: all previous-month invoices issued")
  }

  return { failed, pending, invoiceIds }
}

// ── Cron schedule ────────────────────────────────────────────────────────────

// "0 9 1 * *" — 09:00 on the 1st of every month (TZ=Asia/Taipei in environment)
export function startReconcilerCron() {
  cron.schedule(
    "0 9 1 * *",
    async () => {
      logger.info("Starting monthly invoice reconciliation")
      try {
        await reconcilePreviousMonth()
      } catch (err) {
        logger.error({ err }, "Reconciliation cron failed")
      }
    },
    { timezone: "Asia/Taipei" }
  )
  logger.info("Invoice reconciler cron scheduled (1st of month, 09:00 Taipei)")
}
```

- [ ] **Step 3: Register reconciler in apps/api/src/index.ts**

```typescript
import { startReconcilerCron } from "./workers/invoice-reconciler"
// ...
startReconcilerCron()
```

- [ ] **Step 4: Write reconciler tests**

`apps/api/src/workers/__tests__/invoice-reconciler.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFrom = vi.fn()
vi.mock("../../lib/supabase", () => ({
  adminClient: { from: mockFrom },
}))

const { reconcilePreviousMonth } = await import("../invoice-reconciler")

describe("reconcilePreviousMonth", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns zero counts when all invoices are issued", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    })
    const result = await reconcilePreviousMonth()
    expect(result.failed).toBe(0)
    expect(result.pending).toBe(0)
    expect(result.invoiceIds).toHaveLength(0)
  })

  it("returns counts for failed and pending invoices", async () => {
    const mockData = [
      { id: "inv-1", status: "error", order_id: "ord-1", amount: "500", error_message: "Timeout", created_at: "" },
      { id: "inv-2", status: "pending", order_id: "ord-2", amount: "300", error_message: null, created_at: "" },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      }),
    })
    const result = await reconcilePreviousMonth()
    expect(result.failed).toBe(1)
    expect(result.pending).toBe(1)
    expect(result.invoiceIds).toEqual(["inv-1", "inv-2"])
  })

  it("throws when DB query fails", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: null, error: { message: "connection refused" } }),
          }),
        }),
      }),
    })
    await expect(reconcilePreviousMonth()).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx vitest run src/workers/__tests__/invoice-reconciler.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workers/invoice-reconciler.ts apps/api/src/workers/__tests__/invoice-reconciler.test.ts apps/api/src/index.ts
git commit -m "feat(api): monthly invoice reconciliation cron — alerts on uninvoiced orders from previous month"
```

---

## Task 9: Integration Smoke Test + Definition of Done

- [ ] **Step 1: Apply migration and verify schema**

Paste `0004_invoice_carrier.sql` into Supabase Dashboard → SQL Editor → Run.
Verify in Table Editor: `invoices` table shows all new columns (`carrier_type`, `carrier_number`, `love_code`, `company_title`, `amego_raw_response`, `error_message`, `retry_count`, `random_code`, `created_at`).

- [ ] **Step 2: Start the API server**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npm run dev
```
Expected: "API server started", "Invoice-issuer worker started", "Invoice reconciler cron scheduled"

- [ ] **Step 3: Start the web server**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npm run dev
```
Expected: Ready on `http://localhost:3000`

- [ ] **Step 4: Verify InvoiceSelector renders in checkout**

Open `http://localhost:3000/checkout` (after adding a product to cart per Plan 3 flow).
Confirm the invoice section shows three radio options: 雲端發票, 載具歸戶, 公司統編.
Select 載具歸戶 → confirm carrier type dropdown appears.
Select 公司統編 → confirm 統一編號 and 公司抬頭 inputs appear.

- [ ] **Step 5: Simulate payment-confirmed → invoice queue**

Using the Railway API shell or Supabase SQL Editor, insert a test invoice and manually enqueue a job:
```typescript
// In apps/api REPL or a test script:
import { invoiceQueue } from "./src/workers/invoice-issuer"
await invoiceQueue.add("test", {
  invoiceId: "test-inv-id",
  orderId: "test-order-id",
  type: "B2C_2",
  amount: 500,
  taxAmount: 25,
  buyerEmail: "test@realreal.cc",
  items: [{ name: "測試商品", qty: 1, unitPrice: 500, amount: 500 }],
})
```
Expected: Worker logs show "Processing invoice job" and attempts Amego API call.

- [ ] **Step 6: Verify admin invoices page renders**

Open `http://localhost:3000/admin/invoices` (as admin user per Plan 1 seed).
Confirm table renders with status filter tabs.
Confirm 重新開立 button appears for error-status invoices.

- [ ] **Step 7: Verify InvoiceCard renders in My Account order detail**

Open `http://localhost:3000/my-account/orders/[test-order-id]`.
Confirm InvoiceCard renders showing type, amount, status badge.

- [ ] **Step 8: Verify Amego webhook endpoint**

```bash
# Generate test HMAC signature
SECRET="test-webhook-secret"
BODY='{"event":"invoice.issued","amegoId":"amg-test-001","invoiceNumber":"AB-99999999","randomCode":"9999","issuedAt":"2026-03-27T10:00:00Z"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -s -X POST http://localhost:4000/webhooks/amego \
  -H "Content-Type: application/json" \
  -H "X-Amego-Signature: $SIG" \
  -d "$BODY"
```
Expected: `{"ok":true}`

- [ ] **Step 9: Run all unit tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal && npx turbo test
```
Expected: All tests PASS across apps/api and apps/web

- [ ] **Step 10: TypeScript check**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/packages/db && npx tsc --noEmit
```
Expected: Zero errors in all three packages

---

## Definition of Done

- [ ] `invoices` table extended with carrier, audit, and retry columns; migration applied in Supabase
- [ ] `apps/api/src/lib/amego.ts` — `issueInvoice`, `voidInvoice`, `queryInvoice` with retry on 429; 4 tests PASS
- [ ] `invoice-issuer` BullMQ worker — enqueues after payment confirmed, updates invoice status, retries 5x with exponential backoff; 3 tests PASS
- [ ] `InvoiceSelector` component — renders B2C_2 / B2C_3 / B2B options with carrier sub-fields; saved to `order.metadata.invoice`
- [ ] `/admin/invoices` page — table with status filter, re-issue button, void action, PDF link
- [ ] Amego webhook at `POST /webhooks/amego` — HMAC-verified, idempotent; 4 tests PASS
- [ ] `InvoiceCard` in `/my-account/orders/[id]` — shows invoice number, type, carrier, public verification link
- [ ] Monthly reconciliation cron — runs on 1st of month, logs alert for uninvoiced previous-month orders; 3 tests PASS
- [ ] `npx turbo test` — all tests PASS (14+ new tests across amego client, issuer worker, webhook, reconciler)
- [ ] `tsc --noEmit` — zero errors in all 3 packages (web, api, db)
- [ ] `AMEGO_WEBHOOK_SECRET` documented in `apps/api/.env.example`
