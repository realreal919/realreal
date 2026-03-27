import { pgTable, uuid, text, boolean, numeric, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
})

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  categoryId: uuid("category_id"),
  images: jsonb("images").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  sku: text("sku"),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
  stockQty: integer("stock_qty").notNull().default(0),
  weight: numeric("weight", { precision: 8, scale: 3 }),
  attributes: jsonb("attributes").$type<Record<string, string | number>>(),
}, (t) => ({
  // Partial unique index: only enforces uniqueness for non-null SKUs
  // Full SQL: CREATE UNIQUE INDEX product_variants_sku_idx ON product_variants(sku) WHERE sku IS NOT NULL
  skuIdx: uniqueIndex("product_variants_sku_idx").on(t.sku).where(sql`sku IS NOT NULL`),
}))
