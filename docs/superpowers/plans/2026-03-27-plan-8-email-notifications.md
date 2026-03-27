# Plan 8: Email & Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up a complete transactional email system using Resend + React Email, routed through a BullMQ worker, covering all customer lifecycle emails: order confirmation, payment, shipping, subscription billing, membership tier upgrade, and auth emails.

**Architecture:** All emails are enqueued as BullMQ jobs in the `email-sender` queue (apps/api). The worker renders React Email templates server-side and dispatches via the Resend API. Delivery outcomes are logged to the `email_logs` table. Supabase Auth custom SMTP is configured to also route through Resend so brand templates are applied to confirm/reset emails.

**Tech Stack:** Resend SDK, @react-email/components, BullMQ (already provisioned in Plan 1), Supabase PostgreSQL (email_logs table), React Email renderer

**Spec:** `docs/superpowers/specs/2026-03-26-realreal-rewrite-design.md`

**Depends On:** Plan 1 (Foundation) — BullMQ Redis connection, Express app skeleton, Supabase client

---

## File Map

```
realreal/
├── apps/
│   └── api/
│       ├── src/
│       │   ├── lib/
│       │   │   └── email.ts                         # Resend client singleton
│       │   ├── workers/
│       │   │   └── email-sender.ts                  # BullMQ worker: renders + sends
│       │   └── routes/
│       │       └── webhooks/
│       │           └── resend.ts                    # Bounce/unsubscribe webhook handler
│       └── emails/
│           ├── _layout/
│           │   └── BaseLayout.tsx                   # Brand wrapper: logo, colors, footer
│           ├── OrderConfirmation.tsx
│           ├── PaymentConfirmed.tsx
│           ├── OrderShipped.tsx
│           ├── SubscriptionBilled.tsx
│           ├── SubscriptionFailed.tsx
│           ├── TierUpgrade.tsx
│           ├── AuthConfirm.tsx
│           └── AuthPasswordReset.tsx
└── packages/
    └── db/
        └── migrations/
            └── 0008_email_logs.sql                  # email_logs table
```

---

## Task 1: Resend + React Email Setup

**Files:**
- Create: `apps/api/src/lib/email.ts`
- Create: `apps/api/emails/_layout/BaseLayout.tsx`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm install resend @react-email/components @react-email/render
```

- [ ] **Step 2: Add env vars to apps/api/.env.example**

```bash
# ── Resend ─────────────────────────────────────────
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=誠真生活 RealReal <noreply@realreal.cc>
RESEND_WEBHOOK_SECRET=
```

- [ ] **Step 3: Write Resend client**

`apps/api/src/lib/email.ts`:
```typescript
import { Resend } from "resend"
import { render } from "@react-email/render"
import type { ReactElement } from "react"

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set")
}

export const resend = new Resend(process.env.RESEND_API_KEY)

export const FROM_ADDRESS =
  process.env.RESEND_FROM_ADDRESS ?? "誠真生活 RealReal <noreply@realreal.cc>"

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  template: ReactElement
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
}

export async function sendEmail(opts: SendEmailOptions) {
  const html = await render(opts.template)
  const text = await render(opts.template, { plainText: true })

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html,
    text,
    reply_to: opts.replyTo,
    tags: opts.tags,
  })

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`)
  }

  return data
}
```

- [ ] **Step 4: Write BaseLayout template**

`apps/api/emails/_layout/BaseLayout.tsx`:
```typescript
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"

const BRAND_GREEN = "#4a7c59"
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc"

interface BaseLayoutProps {
  preview: string
  children: React.ReactNode
}

export function BaseLayout({ preview, children }: BaseLayoutProps) {
  return (
    <Html lang="zh-TW">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Link href={SITE_URL}>
              <Img
                src={`${SITE_URL}/logo.png`}
                width={120}
                height={40}
                alt="誠真生活 RealReal"
              />
            </Link>
          </Section>

          {/* Content */}
          <Section style={styles.content}>{children}</Section>

          {/* Footer */}
          <Hr style={styles.hr} />
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              誠真生活 RealReal — 純植物，真實力
            </Text>
            <Text style={styles.footerText}>
              <Link href={`${SITE_URL}/unsubscribe`} style={styles.footerLink}>
                取消訂閱
              </Link>
              {" · "}
              <Link href={`${SITE_URL}/privacy`} style={styles.footerLink}>
                隱私政策
              </Link>
              {" · "}
              <Link href={`${SITE_URL}/contact`} style={styles.footerLink}>
                聯絡我們
              </Link>
            </Text>
            <Text style={styles.footerMuted}>
              © {new Date().getFullYear()} 誠真生活股份有限公司
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const styles = {
  body: {
    backgroundColor: "#f9fafb",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    margin: "0",
    padding: "0",
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "32px auto",
    maxWidth: "600px",
    borderRadius: "8px",
    overflow: "hidden",
  },
  header: {
    backgroundColor: BRAND_GREEN,
    padding: "24px 32px",
  },
  content: {
    padding: "32px",
  },
  hr: {
    borderColor: "#e5e7eb",
    margin: "0",
  },
  footer: {
    padding: "24px 32px",
  },
  footerText: {
    color: "#6b7280",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "4px 0",
    textAlign: "center" as const,
  },
  footerLink: {
    color: BRAND_GREEN,
    textDecoration: "underline",
  },
  footerMuted: {
    color: "#9ca3af",
    fontSize: "12px",
    margin: "8px 0 0",
    textAlign: "center" as const,
  },
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/email.ts apps/api/emails/_layout apps/api/.env.example
git commit -m "feat(api): Resend client + React Email BaseLayout"
```

---

## Task 2: email_logs Migration + BullMQ Email-Sender Worker

**Files:**
- Create: `packages/db/migrations/0008_email_logs.sql`
- Create: `apps/api/src/workers/email-sender.ts`

- [ ] **Step 1: Write email_logs migration**

`packages/db/migrations/0008_email_logs.sql`:
```sql
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT,
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'bounced', 'unsubscribed')),
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX email_logs_recipient_idx ON email_logs(recipient);
CREATE INDEX email_logs_template_idx ON email_logs(template);
CREATE INDEX email_logs_status_idx ON email_logs(status);

CREATE TRIGGER email_logs_updated_at
  BEFORE UPDATE ON email_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Apply migration in Supabase SQL Editor**

Paste `0008_email_logs.sql` into Supabase Dashboard → SQL Editor → Run
Expected: "Success. No rows returned"

- [ ] **Step 3: Write email-sender worker**

`apps/api/src/workers/email-sender.ts`:
```typescript
import { Worker, type Job } from "bullmq"
import { connection } from "../lib/redis"
import { sendEmail } from "../lib/email"
import { supabase } from "../lib/supabase"
import * as React from "react"

// Template imports
import { OrderConfirmationEmail } from "../../emails/OrderConfirmation"
import { PaymentConfirmedEmail } from "../../emails/PaymentConfirmed"
import { OrderShippedEmail } from "../../emails/OrderShipped"
import { SubscriptionBilledEmail } from "../../emails/SubscriptionBilled"
import { SubscriptionFailedEmail } from "../../emails/SubscriptionFailed"
import { TierUpgradeEmail } from "../../emails/TierUpgrade"

export type EmailJobData = {
  to: string
  template: string
  data: Record<string, unknown>
  logId?: string
}

function buildTemplate(template: string, data: Record<string, unknown>) {
  switch (template) {
    case "order-confirmation":
      return React.createElement(OrderConfirmationEmail, data as any)
    case "payment-confirmed":
      return React.createElement(PaymentConfirmedEmail, data as any)
    case "order-shipped":
      return React.createElement(OrderShippedEmail, data as any)
    case "subscription-billed":
      return React.createElement(SubscriptionBilledEmail, data as any)
    case "subscription-failed":
      return React.createElement(SubscriptionFailedEmail, data as any)
    case "tier-upgrade":
      return React.createElement(TierUpgradeEmail, data as any)
    default:
      throw new Error(`Unknown email template: ${template}`)
  }
}

const SUBJECTS: Record<string, string> = {
  "order-confirmation": "您的訂單已成立 — 誠真生活 RealReal",
  "payment-confirmed": "付款成功，我們開始備貨了！",
  "order-shipped": "您的訂單已出貨",
  "subscription-billed": "定期購訂單已建立",
  "subscription-failed": "【請注意】定期購扣款失敗",
  "tier-upgrade": "恭喜您升級會員等級！",
}

export const emailSenderWorker = new Worker<EmailJobData>(
  "email-sender",
  async (job: Job<EmailJobData>) => {
    const { to, template, data, logId } = job.data

    console.log(`[email-sender] processing job ${job.id}`, { to, template })

    // Insert log row if not already created by the enqueuer
    let resolvedLogId = logId
    if (!resolvedLogId) {
      const { data: log } = await supabase
        .from("email_logs")
        .insert({ recipient: to, template, subject: SUBJECTS[template] ?? template, status: "queued" })
        .select("id")
        .single()
      resolvedLogId = log?.id
    }

    try {
      const element = buildTemplate(template, data)
      const subject = SUBJECTS[template] ?? template

      const result = await sendEmail({
        to,
        subject,
        template: element,
        tags: [{ name: "template", value: template }],
      })

      // Update log to sent
      if (resolvedLogId) {
        await supabase
          .from("email_logs")
          .update({ status: "sent", resend_id: result?.id })
          .eq("id", resolvedLogId)
      }

      console.log(`[email-sender] sent ${template} to ${to}`, { resendId: result?.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[email-sender] failed ${template} to ${to}`, { error: message })

      if (resolvedLogId) {
        await supabase
          .from("email_logs")
          .update({ status: "failed", error: message })
          .eq("id", resolvedLogId)
      }

      throw err // re-throw so BullMQ retries
    }
  },
  {
    connection,
    concurrency: 5,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  }
)

emailSenderWorker.on("failed", (job, err) => {
  console.error(`[email-sender] job ${job?.id} failed permanently`, { error: err.message })
})
```

- [ ] **Step 4: Register worker in apps/api/src/index.ts**

In `apps/api/src/index.ts`, import and start the worker alongside any existing workers:

```typescript
import "./workers/email-sender"
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0008_email_logs.sql apps/api/src/workers/email-sender.ts apps/api/src/index.ts
git commit -m "feat(api): BullMQ email-sender worker + email_logs table"
```

---

## Task 3: Order Confirmation Email

**Files:**
- Create: `apps/api/emails/OrderConfirmation.tsx`

- [ ] **Step 1: Write OrderConfirmation template**

`apps/api/emails/OrderConfirmation.tsx`:
```typescript
import {
  Button,
  Column,
  Heading,
  Img,
  Row,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "./_layout/BaseLayout"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc"
const BRAND_GREEN = "#4a7c59"

export interface OrderItem {
  name: string
  variantName: string
  imageUrl?: string
  qty: number
  unitPrice: number
}

export interface OrderConfirmationEmailProps {
  orderNumber: string
  customerName: string
  items: OrderItem[]
  subtotal: number
  shippingFee: number
  discountAmount: number
  total: number
  shippingAddress: string
  expectedDelivery?: string
}

export function OrderConfirmationEmail({
  orderNumber,
  customerName,
  items,
  subtotal,
  shippingFee,
  discountAmount,
  total,
  shippingAddress,
  expectedDelivery,
}: OrderConfirmationEmailProps) {
  return (
    <BaseLayout preview={`訂單 ${orderNumber} 已成立，感謝您的購買！`}>
      <Heading style={styles.h1}>感謝您的訂購，{customerName}！</Heading>
      <Text style={styles.body}>
        您的訂單 <strong>{orderNumber}</strong> 已成立。我們正在備貨，請耐心等候。
      </Text>

      {/* Items */}
      <Section style={styles.itemsSection}>
        {items.map((item) => (
          <Row key={item.variantName} style={styles.itemRow}>
            {item.imageUrl && (
              <Column style={{ width: "64px" }}>
                <Img src={item.imageUrl} width={56} height={56} style={styles.itemImg} alt={item.name} />
              </Column>
            )}
            <Column style={{ paddingLeft: "12px" }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemVariant}>{item.variantName} × {item.qty}</Text>
            </Column>
            <Column style={{ textAlign: "right" as const }}>
              <Text style={styles.itemPrice}>NT${(item.unitPrice * item.qty).toLocaleString()}</Text>
            </Column>
          </Row>
        ))}
      </Section>

      {/* Totals */}
      <Section style={styles.totalsSection}>
        <Row>
          <Column><Text style={styles.totalLabel}>小計</Text></Column>
          <Column style={{ textAlign: "right" as const }}>
            <Text style={styles.totalValue}>NT${subtotal.toLocaleString()}</Text>
          </Column>
        </Row>
        <Row>
          <Column><Text style={styles.totalLabel}>運費</Text></Column>
          <Column style={{ textAlign: "right" as const }}>
            <Text style={styles.totalValue}>
              {shippingFee === 0 ? "免運" : `NT${shippingFee.toLocaleString()}`}
            </Text>
          </Column>
        </Row>
        {discountAmount > 0 && (
          <Row>
            <Column><Text style={styles.totalLabel}>折扣</Text></Column>
            <Column style={{ textAlign: "right" as const }}>
              <Text style={{ ...styles.totalValue, color: "#dc2626" }}>
                -NT${discountAmount.toLocaleString()}
              </Text>
            </Column>
          </Row>
        )}
        <Row>
          <Column><Text style={{ ...styles.totalLabel, fontWeight: "700" }}>總計</Text></Column>
          <Column style={{ textAlign: "right" as const }}>
            <Text style={{ ...styles.totalValue, fontWeight: "700", color: BRAND_GREEN }}>
              NT${total.toLocaleString()}
            </Text>
          </Column>
        </Row>
      </Section>

      {/* Delivery info */}
      <Section style={styles.infoSection}>
        <Text style={styles.infoLabel}>配送地址</Text>
        <Text style={styles.infoValue}>{shippingAddress}</Text>
        {expectedDelivery && (
          <>
            <Text style={styles.infoLabel}>預計到貨</Text>
            <Text style={styles.infoValue}>{expectedDelivery}</Text>
          </>
        )}
      </Section>

      <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
        <Button href={`${SITE_URL}/my-account/orders/${orderNumber}`} style={styles.button}>
          查看訂單
        </Button>
      </Section>
    </BaseLayout>
  )
}

const styles = {
  h1: { fontSize: "22px", fontWeight: "700", color: "#111827", margin: "0 0 16px" },
  body: { fontSize: "15px", color: "#374151", lineHeight: "24px" },
  itemsSection: { margin: "24px 0", borderTop: "1px solid #e5e7eb", paddingTop: "16px" },
  itemRow: { marginBottom: "16px" },
  itemImg: { borderRadius: "6px", objectFit: "cover" as const },
  itemName: { fontSize: "14px", fontWeight: "600", color: "#111827", margin: "0" },
  itemVariant: { fontSize: "13px", color: "#6b7280", margin: "2px 0 0" },
  itemPrice: { fontSize: "14px", fontWeight: "600", color: "#111827", margin: "0" },
  totalsSection: { borderTop: "1px solid #e5e7eb", paddingTop: "16px", margin: "8px 0" },
  totalLabel: { fontSize: "14px", color: "#374151", margin: "4px 0" },
  totalValue: { fontSize: "14px", color: "#111827", margin: "4px 0" },
  infoSection: { backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px", margin: "24px 0 0" },
  infoLabel: { fontSize: "12px", color: "#6b7280", margin: "8px 0 2px", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  infoValue: { fontSize: "14px", color: "#111827", margin: "0 0 8px" },
  button: { backgroundColor: "#4a7c59", color: "#ffffff", padding: "12px 28px", borderRadius: "6px", fontSize: "15px", fontWeight: "600", textDecoration: "none", display: "inline-block" },
}

export default OrderConfirmationEmail
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/emails/OrderConfirmation.tsx
git commit -m "feat(email): order confirmation template"
```

---

## Task 4: Payment Confirmed Email

**Files:**
- Create: `apps/api/emails/PaymentConfirmed.tsx`

- [ ] **Step 1: Write PaymentConfirmed template**

`apps/api/emails/PaymentConfirmed.tsx`:
```typescript
import {
  Button,
  Column,
  Heading,
  Row,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "./_layout/BaseLayout"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc"
const BRAND_GREEN = "#4a7c59"

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pchomepay: "PChomePay 支付連",
  linepay: "LINE Pay",
  jkopay: "街口支付",
  creditcard: "信用卡",
  atm: "ATM 轉帳",
  cod: "貨到付款",
}

export interface PaymentConfirmedEmailProps {
  orderNumber: string
  customerName: string
  paymentAmount: number
  paymentMethod: string
  invoiceNumber?: string
  paidAt: string
}

export function PaymentConfirmedEmail({
  orderNumber,
  customerName,
  paymentAmount,
  paymentMethod,
  invoiceNumber,
  paidAt,
}: PaymentConfirmedEmailProps) {
  return (
    <BaseLayout preview={`訂單 ${orderNumber} 付款成功！`}>
      <Heading style={styles.h1}>付款成功，我們開始備貨了！</Heading>
      <Text style={styles.body}>
        親愛的 {customerName}，您的訂單 <strong>{orderNumber}</strong> 已完成付款，我們正在為您備貨。
      </Text>

      <Section style={styles.card}>
        <Row>
          <Column style={{ width: "50%" }}>
            <Text style={styles.label}>付款金額</Text>
            <Text style={styles.valueHighlight}>NT${paymentAmount.toLocaleString()}</Text>
          </Column>
          <Column style={{ width: "50%" }}>
            <Text style={styles.label}>付款方式</Text>
            <Text style={styles.value}>
              {PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod}
            </Text>
          </Column>
        </Row>
        <Row style={{ marginTop: "16px" }}>
          <Column style={{ width: "50%" }}>
            <Text style={styles.label}>付款時間</Text>
            <Text style={styles.value}>{paidAt}</Text>
          </Column>
          {invoiceNumber && (
            <Column style={{ width: "50%" }}>
              <Text style={styles.label}>電子發票號碼</Text>
              <Text style={styles.value}>{invoiceNumber}</Text>
            </Column>
          )}
        </Row>
      </Section>

      <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
        <Button href={`${SITE_URL}/my-account/orders/${orderNumber}`} style={styles.button}>
          追蹤訂單
        </Button>
      </Section>
    </BaseLayout>
  )
}

const BRAND_GREEN = "#4a7c59"

const styles = {
  h1: { fontSize: "22px", fontWeight: "700", color: "#111827", margin: "0 0 16px" },
  body: { fontSize: "15px", color: "#374151", lineHeight: "24px" },
  card: { backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "20px", margin: "24px 0" },
  label: { fontSize: "12px", color: "#6b7280", margin: "0 0 4px", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  value: { fontSize: "15px", color: "#111827", margin: "0", fontWeight: "500" },
  valueHighlight: { fontSize: "20px", color: BRAND_GREEN, margin: "0", fontWeight: "700" },
  button: { backgroundColor: "#4a7c59", color: "#ffffff", padding: "12px 28px", borderRadius: "6px", fontSize: "15px", fontWeight: "600", textDecoration: "none", display: "inline-block" },
}

export default PaymentConfirmedEmail
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/emails/PaymentConfirmed.tsx
git commit -m "feat(email): payment confirmed template"
```

---

## Task 5: Order Shipped Email

**Files:**
- Create: `apps/api/emails/OrderShipped.tsx`

- [ ] **Step 1: Write OrderShipped template**

`apps/api/emails/OrderShipped.tsx`:
```typescript
import {
  Button,
  Column,
  Heading,
  Row,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "./_layout/BaseLayout"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc"

export interface OrderShippedEmailProps {
  orderNumber: string
  customerName: string
  trackingNumber?: string
  carrier?: string
  /** For CVS pickup: store name + address */
  cvsStoreName?: string
  cvsStoreAddress?: string
  /** For home delivery: formatted address string */
  homeAddress?: string
  estimatedDelivery?: string
  trackingUrl?: string
}

export function OrderShippedEmail({
  orderNumber,
  customerName,
  trackingNumber,
  carrier,
  cvsStoreName,
  cvsStoreAddress,
  homeAddress,
  estimatedDelivery,
  trackingUrl,
}: OrderShippedEmailProps) {
  const isCVS = Boolean(cvsStoreName)

  return (
    <BaseLayout preview={`您的訂單 ${orderNumber} 已出貨！`}>
      <Heading style={styles.h1}>您的訂單已出貨！</Heading>
      <Text style={styles.body}>
        親愛的 {customerName}，您的訂單 <strong>{orderNumber}</strong> 已交由物流配送，請靜待收貨。
      </Text>

      <Section style={styles.card}>
        {trackingNumber && (
          <Row style={styles.row}>
            <Column style={styles.labelCol}>
              <Text style={styles.label}>追蹤號碼</Text>
            </Column>
            <Column>
              <Text style={styles.value}>{trackingNumber}</Text>
            </Column>
          </Row>
        )}
        {carrier && (
          <Row style={styles.row}>
            <Column style={styles.labelCol}>
              <Text style={styles.label}>物流商</Text>
            </Column>
            <Column>
              <Text style={styles.value}>{carrier}</Text>
            </Column>
          </Row>
        )}
        {isCVS ? (
          <>
            <Row style={styles.row}>
              <Column style={styles.labelCol}>
                <Text style={styles.label}>取貨門市</Text>
              </Column>
              <Column>
                <Text style={styles.value}>{cvsStoreName}</Text>
              </Column>
            </Row>
            {cvsStoreAddress && (
              <Row style={styles.row}>
                <Column style={styles.labelCol}>
                  <Text style={styles.label}>門市地址</Text>
                </Column>
                <Column>
                  <Text style={styles.value}>{cvsStoreAddress}</Text>
                </Column>
              </Row>
            )}
          </>
        ) : (
          homeAddress && (
            <Row style={styles.row}>
              <Column style={styles.labelCol}>
                <Text style={styles.label}>配送地址</Text>
              </Column>
              <Column>
                <Text style={styles.value}>{homeAddress}</Text>
              </Column>
            </Row>
          )
        )}
        {estimatedDelivery && (
          <Row style={styles.row}>
            <Column style={styles.labelCol}>
              <Text style={styles.label}>預計送達</Text>
            </Column>
            <Column>
              <Text style={styles.value}>{estimatedDelivery}</Text>
            </Column>
          </Row>
        )}
      </Section>

      <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
        {trackingUrl ? (
          <Button href={trackingUrl} style={styles.button}>
            查看物流進度
          </Button>
        ) : (
          <Button href={`${SITE_URL}/my-account/orders/${orderNumber}`} style={styles.button}>
            查看訂單
          </Button>
        )}
      </Section>
    </BaseLayout>
  )
}

const styles = {
  h1: { fontSize: "22px", fontWeight: "700", color: "#111827", margin: "0 0 16px" },
  body: { fontSize: "15px", color: "#374151", lineHeight: "24px" },
  card: { backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "20px", margin: "24px 0" },
  row: { marginBottom: "12px" },
  labelCol: { width: "100px", minWidth: "100px" },
  label: { fontSize: "12px", color: "#6b7280", margin: "0", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  value: { fontSize: "14px", color: "#111827", margin: "0", fontWeight: "500" },
  button: { backgroundColor: "#4a7c59", color: "#ffffff", padding: "12px 28px", borderRadius: "6px", fontSize: "15px", fontWeight: "600", textDecoration: "none", display: "inline-block" },
}

export default OrderShippedEmail
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/emails/OrderShipped.tsx
git commit -m "feat(email): order shipped template with CVS + home delivery support"
```

---

## Task 6: Subscription Billing Emails

**Files:**
- Create: `apps/api/emails/SubscriptionBilled.tsx`
- Create: `apps/api/emails/SubscriptionFailed.tsx`

- [ ] **Step 1: Write SubscriptionBilled template**

`apps/api/emails/SubscriptionBilled.tsx`:
```typescript
import {
  Button,
  Column,
  Heading,
  Row,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "./_layout/BaseLayout"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc"
const BRAND_GREEN = "#4a7c59"

export interface SubscriptionBilledEmailProps {
  customerName: string
  subscriptionId: string
  orderNumber: string
  billingCycle: number
  amount: number
  nextBillingDate: string
  productName: string
}

export function SubscriptionBilledEmail({
  customerName,
  subscriptionId,
  orderNumber,
  billingCycle,
  amount,
  nextBillingDate,
  productName,
}: SubscriptionBilledEmailProps) {
  return (
    <BaseLayout preview={`定期購第 ${billingCycle} 期已扣款成功`}>
      <Heading style={styles.h1}>定期購扣款成功</Heading>
      <Text style={styles.body}>
        親愛的 {customerName}，您的定期購訂閱（{productName}）第 <strong>{billingCycle}</strong> 期已順利扣款，訂單已建立。
      </Text>

      <Section style={styles.card}>
        <Row style={styles.row}>
          <Column style={styles.labelCol}><Text style={styles.label}>訂單編號</Text></Column>
          <Column><Text style={styles.value}>{orderNumber}</Text></Column>
        </Row>
        <Row style={styles.row}>
          <Column style={styles.labelCol}><Text style={styles.label}>扣款金額</Text></Column>
          <Column><Text style={{ ...styles.value, color: BRAND_GREEN, fontWeight: "700" }}>NT${amount.toLocaleString()}</Text></Column>
        </Row>
        <Row style={styles.row}>
          <Column style={styles.labelCol}><Text style={styles.label}>下次扣款</Text></Column>
          <Column><Text style={styles.value}>{nextBillingDate}</Text></Column>
        </Row>
      </Section>

      <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
        <Button href={`${SITE_URL}/my-account/orders/${orderNumber}`} style={styles.button}>
          查看本期訂單
        </Button>
      </Section>
    </BaseLayout>
  )
}

const styles = {
  h1: { fontSize: "22px", fontWeight: "700", color: "#111827", margin: "0 0 16px" },
  body: { fontSize: "15px", color: "#374151", lineHeight: "24px" },
  card: { backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "20px", margin: "24px 0" },
  row: { marginBottom: "12px" },
  labelCol: { width: "100px", minWidth: "100px" },
  label: { fontSize: "12px", color: "#6b7280", margin: "0", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  value: { fontSize: "14px", color: "#111827", margin: "0", fontWeight: "500" },
  button: { backgroundColor: "#4a7c59", color: "#ffffff", padding: "12px 28px", borderRadius: "6px", fontSize: "15px", fontWeight: "600", textDecoration: "none", display: "inline-block" },
}

export default SubscriptionBilledEmail
```

- [ ] **Step 2: Write SubscriptionFailed template**

`apps/api/emails/SubscriptionFailed.tsx`:
```typescript
import {
  Button,
  Column,
  Heading,
  Row,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "./_layout/BaseLayout"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc"

export interface SubscriptionFailedEmailProps {
  customerName: string
  subscriptionId: string
  productName: string
  billingCycle: number
  amount: number
  failedAt: string
  retryDate?: string
  updatePaymentUrl: string
}

export function SubscriptionFailedEmail({
  customerName,
  subscriptionId,
  productName,
  billingCycle,
  amount,
  failedAt,
  retryDate,
  updatePaymentUrl,
}: SubscriptionFailedEmailProps) {
  return (
    <BaseLayout preview={`【請注意】定期購扣款失敗，請更新付款方式`}>
      <Heading style={styles.h1}>定期購扣款失敗</Heading>
      <Text style={styles.body}>
        親愛的 {customerName}，您的定期購訂閱（{productName}）第 <strong>{billingCycle}</strong> 期扣款失敗，金額為 NT${amount.toLocaleString()}。
      </Text>
      <Text style={styles.body}>
        請儘快更新您的付款方式，以確保訂閱不中斷。
      </Text>

      <Section style={styles.alertCard}>
        <Row style={styles.row}>
          <Column style={styles.labelCol}><Text style={styles.label}>扣款失敗時間</Text></Column>
          <Column><Text style={styles.value}>{failedAt}</Text></Column>
        </Row>
        {retryDate && (
          <Row style={styles.row}>
            <Column style={styles.labelCol}><Text style={styles.label}>下次重試</Text></Column>
            <Column><Text style={styles.value}>{retryDate}</Text></Column>
          </Row>
        )}
      </Section>

      <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
        <Button href={updatePaymentUrl} style={styles.buttonPrimary}>
          立即更新付款方式
        </Button>
      </Section>
      <Section style={{ textAlign: "center" as const, marginTop: "12px" }}>
        <Button href={`${SITE_URL}/my-account/subscriptions/${subscriptionId}`} style={styles.buttonSecondary}>
          查看訂閱詳情
        </Button>
      </Section>
    </BaseLayout>
  )
}

const styles = {
  h1: { fontSize: "22px", fontWeight: "700", color: "#991b1b", margin: "0 0 16px" },
  body: { fontSize: "15px", color: "#374151", lineHeight: "24px" },
  alertCard: { backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "20px", margin: "24px 0" },
  row: { marginBottom: "12px" },
  labelCol: { width: "120px", minWidth: "120px" },
  label: { fontSize: "12px", color: "#6b7280", margin: "0", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  value: { fontSize: "14px", color: "#111827", margin: "0", fontWeight: "500" },
  buttonPrimary: { backgroundColor: "#dc2626", color: "#ffffff", padding: "12px 28px", borderRadius: "6px", fontSize: "15px", fontWeight: "600", textDecoration: "none", display: "inline-block" },
  buttonSecondary: { backgroundColor: "#f3f4f6", color: "#374151", padding: "10px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: "500", textDecoration: "none", display: "inline-block" },
}

export default SubscriptionFailedEmail
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/emails/SubscriptionBilled.tsx apps/api/emails/SubscriptionFailed.tsx
git commit -m "feat(email): subscription billing and failed charge templates"
```

---

## Task 7: Membership Tier Upgrade Email

**Files:**
- Create: `apps/api/emails/TierUpgrade.tsx`

- [ ] **Step 1: Write TierUpgrade template**

`apps/api/emails/TierUpgrade.tsx`:
```typescript
import {
  Button,
  Heading,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "./_layout/BaseLayout"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc"
const BRAND_GREEN = "#4a7c59"

const TIER_COLORS: Record<string, string> = {
  "銀卡會員": "#64748b",
  "金卡會員": "#d97706",
  "鑽石會員": "#7c3aed",
}

export interface TierUpgradeEmailProps {
  customerName: string
  newTierName: string
  discountRate: number
  benefits: string[]
  totalSpend: number
}

export function TierUpgradeEmail({
  customerName,
  newTierName,
  discountRate,
  benefits,
  totalSpend,
}: TierUpgradeEmailProps) {
  const tierColor = TIER_COLORS[newTierName] ?? BRAND_GREEN
  const discountPct = (discountRate * 100).toFixed(0)

  return (
    <BaseLayout preview={`恭喜升級為 ${newTierName}！享有 ${discountPct}% 折扣`}>
      <Heading style={styles.h1}>恭喜您升級會員等級！</Heading>
      <Text style={styles.body}>
        親愛的 {customerName}，感謝您對誠真生活的支持！您的累計消費已達 NT${totalSpend.toLocaleString()}，成功升級為
      </Text>

      <Section style={{ ...styles.tierBadge, borderColor: tierColor }}>
        <Text style={{ ...styles.tierName, color: tierColor }}>{newTierName}</Text>
        <Text style={styles.tierDiscount}>全館 {discountPct}% 折扣</Text>
      </Section>

      <Section style={styles.benefitsSection}>
        <Text style={styles.benefitsTitle}>您的專屬權益</Text>
        {benefits.map((benefit) => (
          <Text key={benefit} style={styles.benefitItem}>
            ✓ {benefit}
          </Text>
        ))}
      </Section>

      <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
        <Button href={`${SITE_URL}/shop`} style={{ ...styles.button, backgroundColor: tierColor }}>
          立即享受折扣購物
        </Button>
      </Section>
    </BaseLayout>
  )
}

const styles = {
  h1: { fontSize: "22px", fontWeight: "700", color: "#111827", margin: "0 0 16px" },
  body: { fontSize: "15px", color: "#374151", lineHeight: "24px" },
  tierBadge: { border: "2px solid", borderRadius: "12px", padding: "20px 32px", margin: "24px 0", textAlign: "center" as const },
  tierName: { fontSize: "28px", fontWeight: "700", margin: "0 0 4px" },
  tierDiscount: { fontSize: "16px", color: "#374151", margin: "0", fontWeight: "500" },
  benefitsSection: { backgroundColor: "#f9fafb", borderRadius: "8px", padding: "20px", margin: "24px 0" },
  benefitsTitle: { fontSize: "14px", fontWeight: "600", color: "#6b7280", margin: "0 0 12px", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  benefitItem: { fontSize: "14px", color: "#111827", margin: "0 0 8px", lineHeight: "20px" },
  button: { color: "#ffffff", padding: "12px 28px", borderRadius: "6px", fontSize: "15px", fontWeight: "600", textDecoration: "none", display: "inline-block" },
}

export default TierUpgradeEmail
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/emails/TierUpgrade.tsx
git commit -m "feat(email): membership tier upgrade template"
```

---

## Task 8: Resend Bounce/Unsubscribe Webhook

**Files:**
- Create: `apps/api/src/routes/webhooks/resend.ts`

- [ ] **Step 1: Write Resend webhook handler**

`apps/api/src/routes/webhooks/resend.ts`:
```typescript
import { Router, type Request, type Response } from "express"
import { createHmac } from "crypto"
import { supabase } from "../../lib/supabase"

export const resendWebhookRouter = Router()

function verifyResendSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
  return `sha256=${expected}` === signature
}

resendWebhookRouter.post(
  "/webhooks/resend",
  async (req: Request, res: Response) => {
    const signature = req.headers["svix-signature"] as string | undefined
    const secret = process.env.RESEND_WEBHOOK_SECRET

    if (secret && signature) {
      const rawBody = JSON.stringify(req.body)
      if (!verifyResendSignature(rawBody, signature, secret)) {
        console.warn("[resend-webhook] invalid signature")
        res.status(401).json({ error: "Invalid signature" })
        return
      }
    }

    const { type, data } = req.body as { type: string; data: { email_id: string; to: string[] } }
    console.log(`[resend-webhook] received event: ${type}`, { emailId: data?.email_id })

    const statusMap: Record<string, string> = {
      "email.delivered": "sent",
      "email.bounced": "bounced",
      "email.complained": "unsubscribed",
    }

    const newStatus = statusMap[type]
    if (newStatus && data?.email_id) {
      const { error } = await supabase
        .from("email_logs")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("resend_id", data.email_id)

      if (error) {
        console.error("[resend-webhook] failed to update email_logs", { error: error.message })
      }
    }

    res.status(200).json({ received: true })
  }
)
```

- [ ] **Step 2: Register webhook route in apps/api/src/app.ts**

In `apps/api/src/app.ts`, mount the webhook router:

```typescript
import { resendWebhookRouter } from "./routes/webhooks/resend"
// ...
app.use(express.json())
app.use(resendWebhookRouter)
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/webhooks/resend.ts apps/api/src/app.ts
git commit -m "feat(api): Resend bounce/unsubscribe webhook handler"
```

---

## Task 9: Auth Emails — Supabase Custom SMTP via Resend

**Files:**
- Create: `apps/api/emails/AuthConfirm.tsx`
- Create: `apps/api/emails/AuthPasswordReset.tsx`

- [ ] **Step 1: Configure Supabase custom SMTP**

In Supabase Dashboard → Project Settings → Auth → SMTP Settings:

```
Host:       smtp.resend.com
Port:       465
Username:   resend
Password:   <RESEND_API_KEY>
Sender name: 誠真生活 RealReal
Sender email: noreply@realreal.cc
```

Expected: "Connection verified" green checkmark

- [ ] **Step 2: Write AuthConfirm HTML template**

In Supabase Dashboard → Auth → Email Templates → Confirm signup, paste:

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
<body style="background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background:#4a7c59;padding:24px 32px;">
      <img src="https://realreal.cc/logo.png" width="120" height="40" alt="誠真生活 RealReal" />
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;">請驗證您的電子信箱</h1>
      <p style="font-size:15px;color:#374151;line-height:24px;">感謝您加入誠真生活 RealReal！請點擊下方按鈕完成電子信箱驗證。</p>
      <div style="text-align:center;margin-top:32px;">
        <a href="{{ .ConfirmationURL }}" style="background:#4a7c59;color:#fff;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">驗證電子信箱</a>
      </div>
      <p style="font-size:13px;color:#6b7280;margin-top:24px;">此連結將於 24 小時後失效。若您並未申請帳號，請忽略此郵件。</p>
    </div>
    <hr style="border-color:#e5e7eb;margin:0;" />
    <div style="padding:24px 32px;text-align:center;">
      <p style="font-size:13px;color:#9ca3af;margin:0;">© {{ now | date "2006" }} 誠真生活股份有限公司</p>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 3: Write AuthPasswordReset HTML template**

In Supabase Dashboard → Auth → Email Templates → Reset password, paste:

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
<body style="background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background:#4a7c59;padding:24px 32px;">
      <img src="https://realreal.cc/logo.png" width="120" height="40" alt="誠真生活 RealReal" />
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;">重設密碼</h1>
      <p style="font-size:15px;color:#374151;line-height:24px;">我們收到了您的密碼重設請求。請點擊下方按鈕設定新密碼。</p>
      <div style="text-align:center;margin-top:32px;">
        <a href="{{ .ConfirmationURL }}" style="background:#4a7c59;color:#fff;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">重設密碼</a>
      </div>
      <p style="font-size:13px;color:#6b7280;margin-top:24px;">此連結將於 1 小時後失效。若您並未申請重設密碼，請忽略此郵件，您的帳號不會有任何變更。</p>
    </div>
    <hr style="border-color:#e5e7eb;margin:0;" />
    <div style="padding:24px 32px;text-align:center;">
      <p style="font-size:13px;color:#9ca3af;margin:0;">© {{ now | date "2006" }} 誠真生活股份有限公司</p>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 4: Commit auth template source files**

`apps/api/emails/AuthConfirm.tsx` — keep as a React Email source version for local preview:
```typescript
import { Button, Heading, Section, Text } from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "./_layout/BaseLayout"

export function AuthConfirmEmail({ confirmationUrl }: { confirmationUrl: string }) {
  return (
    <BaseLayout preview="請驗證您的電子信箱 — 誠真生活 RealReal">
      <Heading style={{ fontSize: "22px", fontWeight: "700", color: "#111827", margin: "0 0 16px" }}>
        請驗證您的電子信箱
      </Heading>
      <Text style={{ fontSize: "15px", color: "#374151", lineHeight: "24px" }}>
        感謝您加入誠真生活 RealReal！請點擊下方按鈕完成電子信箱驗證。
      </Text>
      <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
        <Button href={confirmationUrl} style={{ backgroundColor: "#4a7c59", color: "#ffffff", padding: "12px 28px", borderRadius: "6px", fontSize: "15px", fontWeight: "600", textDecoration: "none", display: "inline-block" }}>
          驗證電子信箱
        </Button>
      </Section>
      <Text style={{ fontSize: "13px", color: "#6b7280", marginTop: "24px" }}>
        此連結將於 24 小時後失效。若您並未申請帳號，請忽略此郵件。
      </Text>
    </BaseLayout>
  )
}

export default AuthConfirmEmail
```

`apps/api/emails/AuthPasswordReset.tsx`:
```typescript
import { Button, Heading, Section, Text } from "@react-email/components"
import * as React from "react"
import { BaseLayout } from "./_layout/BaseLayout"

export function AuthPasswordResetEmail({ confirmationUrl }: { confirmationUrl: string }) {
  return (
    <BaseLayout preview="重設您的誠真生活帳號密碼">
      <Heading style={{ fontSize: "22px", fontWeight: "700", color: "#111827", margin: "0 0 16px" }}>
        重設密碼
      </Heading>
      <Text style={{ fontSize: "15px", color: "#374151", lineHeight: "24px" }}>
        我們收到了您的密碼重設請求。請點擊下方按鈕設定新密碼。
      </Text>
      <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
        <Button href={confirmationUrl} style={{ backgroundColor: "#4a7c59", color: "#ffffff", padding: "12px 28px", borderRadius: "6px", fontSize: "15px", fontWeight: "600", textDecoration: "none", display: "inline-block" }}>
          重設密碼
        </Button>
      </Section>
      <Text style={{ fontSize: "13px", color: "#6b7280", marginTop: "24px" }}>
        此連結將於 1 小時後失效。若您並未申請重設密碼，請忽略此郵件。
      </Text>
    </BaseLayout>
  )
}

export default AuthPasswordResetEmail
```

```bash
git add apps/api/emails/AuthConfirm.tsx apps/api/emails/AuthPasswordReset.tsx
git commit -m "feat(email): auth confirm + password reset templates; configure Supabase custom SMTP via Resend"
```

---

## Task 10: Integration Smoke Test + Definition of Done

- [ ] **Step 1: Start the API server**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npm run dev
```
Expected: Worker "email-sender" registered, API on port 4000

- [ ] **Step 2: Send test order-confirmation email**

```bash
curl -X POST http://localhost:4000/internal/test-email \
  -H "x-internal-secret: dev-secret-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "dev@realreal.cc",
    "template": "order-confirmation",
    "data": {
      "orderNumber": "RR-TEST-001",
      "customerName": "測試用戶",
      "items": [{"name":"植物蛋白粉","variantName":"草莓口味 500g","qty":2,"unitPrice":890}],
      "subtotal": 1780,
      "shippingFee": 0,
      "discountAmount": 0,
      "total": 1780,
      "shippingAddress": "台北市信義區市府路1號",
      "expectedDelivery": "2026-03-30"
    }
  }'
```
Expected: `{"queued": true, "jobId": "..."}`

- [ ] **Step 3: Verify Resend dashboard delivery**

Open https://resend.com/emails → confirm email to `dev@realreal.cc` shows `Delivered` status

- [ ] **Step 4: Send test payment-confirmed email**

```bash
curl -X POST http://localhost:4000/internal/test-email \
  -H "x-internal-secret: dev-secret-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "dev@realreal.cc",
    "template": "payment-confirmed",
    "data": {
      "orderNumber": "RR-TEST-001",
      "customerName": "測試用戶",
      "paymentAmount": 1780,
      "paymentMethod": "linepay",
      "paidAt": "2026-03-27 14:30"
    }
  }'
```
Expected: Delivered in Resend dashboard

- [ ] **Step 5: Send test order-shipped email**

```bash
curl -X POST http://localhost:4000/internal/test-email \
  -H "x-internal-secret: dev-secret-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "dev@realreal.cc",
    "template": "order-shipped",
    "data": {
      "orderNumber": "RR-TEST-001",
      "customerName": "測試用戶",
      "trackingNumber": "7110987654321",
      "carrier": "黑貓宅急便",
      "homeAddress": "台北市信義區市府路1號",
      "estimatedDelivery": "2026-03-29"
    }
  }'
```
Expected: Delivered in Resend dashboard

- [ ] **Step 6: Send test subscription-billed email**

```bash
curl -X POST http://localhost:4000/internal/test-email \
  -H "x-internal-secret: dev-secret-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "dev@realreal.cc",
    "template": "subscription-billed",
    "data": {
      "customerName": "測試用戶",
      "subscriptionId": "sub-001",
      "orderNumber": "RR-SUB-001",
      "billingCycle": 3,
      "amount": 1690,
      "nextBillingDate": "2026-04-27",
      "productName": "植物蛋白粉月訂方案"
    }
  }'
```
Expected: Delivered in Resend dashboard

- [ ] **Step 7: Send test subscription-failed email**

```bash
curl -X POST http://localhost:4000/internal/test-email \
  -H "x-internal-secret: dev-secret-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "dev@realreal.cc",
    "template": "subscription-failed",
    "data": {
      "customerName": "測試用戶",
      "subscriptionId": "sub-001",
      "productName": "植物蛋白粉月訂方案",
      "billingCycle": 4,
      "amount": 1690,
      "failedAt": "2026-03-27 09:00",
      "retryDate": "2026-03-30",
      "updatePaymentUrl": "http://localhost:3000/my-account/payment-methods"
    }
  }'
```
Expected: Delivered in Resend dashboard

- [ ] **Step 8: Send test tier-upgrade email**

```bash
curl -X POST http://localhost:4000/internal/test-email \
  -H "x-internal-secret: dev-secret-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "dev@realreal.cc",
    "template": "tier-upgrade",
    "data": {
      "customerName": "測試用戶",
      "newTierName": "金卡會員",
      "discountRate": 0.05,
      "benefits": ["全館 95 折優惠","生日月份雙倍積分","專屬會員活動優先參加"],
      "totalSpend": 10250
    }
  }'
```
Expected: Delivered in Resend dashboard

- [ ] **Step 9: Verify email_logs table populated**

In Supabase Dashboard → Table Editor → email_logs:
Expected: 7 rows, all with `status = 'sent'` and non-null `resend_id`

- [ ] **Step 10: Test Supabase auth email**

In Supabase Dashboard → Auth → Email Templates → click "Send test email"
Expected: Branded email received matching BaseLayout style

- [ ] **Step 11: TypeScript check**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx tsc --noEmit
```
Expected: No errors

---

## Definition of Done

- [ ] `resend` + `@react-email/components` + `@react-email/render` installed in `apps/api`
- [ ] `apps/api/src/lib/email.ts` exports `sendEmail()` and `resend` singleton
- [ ] `apps/api/emails/_layout/BaseLayout.tsx` renders brand header (green), content, and unsubscribe footer
- [ ] `email_logs` table exists in Supabase with `recipient`, `template`, `resend_id`, `status` columns
- [ ] BullMQ `email-sender` worker processes `{to, template, data}` jobs, renders templates, and sends via Resend
- [ ] All 6 transactional templates exist: `OrderConfirmation`, `PaymentConfirmed`, `OrderShipped`, `SubscriptionBilled`, `SubscriptionFailed`, `TierUpgrade`
- [ ] Auth templates (`AuthConfirm`, `AuthPasswordReset`) exist as React Email source files; Supabase SMTP configured to Resend
- [ ] Resend webhook endpoint at `POST /webhooks/resend` updates `email_logs.status` on bounce/unsubscribe events
- [ ] All 7 smoke-test emails appear as `Delivered` in Resend dashboard
- [ ] `email_logs` table shows 7 rows with `status = 'sent'` and valid `resend_id` values
- [ ] `tsc --noEmit` — zero errors in `apps/api`
