import { pgTable, uuid, text, numeric, integer, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core"

type BenefitItem = { label: string; description?: string }

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  interval: text("interval").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  variantId: uuid("variant_id"),
  qty: integer("qty"),
  benefits: jsonb("benefits").$type<BenefitItem[]>(),
  isActive: boolean("is_active").notNull().default(true),
})

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  planId: uuid("plan_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("active"),
  paymentMethod: text("payment_method").notNull().default("pchomepay"),
  paymentMethodToken: text("payment_method_token"),
  tokenKeyVersion: integer("token_key_version").notNull().default(1),
  retryCount: integer("retry_count").notNull().default(0),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  nextBillingDate: date("next_billing_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const subscriptionOrders = pgTable("subscription_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").notNull(),
  orderId: uuid("order_id"),
  billingCycle: integer("billing_cycle").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status").notNull().default("pending"),
})

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  minOrder: numeric("min_order", { precision: 10, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  applicableTo: text("applicable_to").notNull().default("order"),
})

export const couponUses = pgTable("coupon_uses", {
  id: uuid("id").primaryKey().defaultRandom(),
  couponId: uuid("coupon_id").notNull(),
  userId: uuid("user_id"),
  orderId: uuid("order_id"),
  subscriptionId: uuid("subscription_id"),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
})
