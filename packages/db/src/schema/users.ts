import { pgTable, uuid, text, numeric, integer, timestamp, date, jsonb } from "drizzle-orm/pg-core"

export const membershipTiers = pgTable("membership_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  minSpend: numeric("min_spend", { precision: 10, scale: 2 }).notNull().default("0"),
  discountRate: numeric("discount_rate", { precision: 5, scale: 4 }).notNull().default("0"),
  benefits: jsonb("benefits"),
  sortOrder: integer("sort_order").notNull().default(0),
})

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id").primaryKey(),
  displayName: text("display_name"),
  phone: text("phone"),
  birthday: date("birthday"),
  taxId: text("tax_id"),
  totalSpend: numeric("total_spend", { precision: 12, scale: 2 }).notNull().default("0"),
  membershipTierId: uuid("membership_tier_id"),
  role: text("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
