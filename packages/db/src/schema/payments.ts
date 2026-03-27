import { pgTable, uuid, text, numeric, timestamp, jsonb, unique } from "drizzle-orm/pg-core"

// Type definitions for typed JSONB columns
type GatewayResponse = Record<string, unknown>
type WebhookPayload = Record<string, unknown>

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  gateway: text("gateway").notNull(),
  gatewayTxId: text("gateway_tx_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  rawResponse: jsonb("raw_response").$type<GatewayResponse>(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const logistics = pgTable("logistics", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  provider: text("provider").notNull().default("ecpay"),
  type: text("type").notNull(),
  ecpayLogisticsId: text("ecpay_logistics_id"),
  trackingNumber: text("tracking_number"),
  cvsPaymentNo: text("cvs_payment_no"),
  cvsValidationNo: text("cvs_validation_no"),
  status: text("status").notNull().default("pending"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  rawResponse: jsonb("raw_response").$type<GatewayResponse>(),
})

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  gateway: text("gateway").notNull(),
  merchantTradeNo: text("merchant_trade_no").notNull(),
  payload: jsonb("payload").notNull().$type<WebhookPayload>(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.gateway, t.merchantTradeNo),
}))

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  invoiceNumber: text("invoice_number"),
  type: text("type").notNull(),
  taxId: text("tax_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  amegoId: text("amego_id"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
})
