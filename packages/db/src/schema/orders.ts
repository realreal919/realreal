import { pgTable, uuid, text, numeric, integer, timestamp, jsonb } from "drizzle-orm/pg-core"

type ProductSnapshot = {
  name: string
  sku: string | null
  variantName: string
  price: string
  imageUrl?: string
}

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  userId: uuid("user_id"),
  guestEmail: text("guest_email"),
  status: text("status").notNull().default("pending"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  shippingMethod: text("shipping_method"),
  invoiceId: uuid("invoice_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  variantId: uuid("variant_id"),
  productSnapshot: jsonb("product_snapshot").notNull().$type<ProductSnapshot>(),
  qty: integer("qty").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
})

export const orderAddresses = pgTable("order_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  addressType: text("address_type").notNull(),
  cvsStoreId: text("cvs_store_id"),
  cvsType: text("cvs_type"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
})
