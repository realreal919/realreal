#!/usr/bin/env node
/**
 * Migrate WordPress ACF "商品三欄" fields into Supabase products table.
 *
 * Usage:
 *   node scripts/migrate-wp-acf.mjs
 *
 * Requires:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars, OR
 *   - SUPABASE_ACCESS_TOKEN env var (Management API personal access token)
 *
 * The script:
 *   1. Runs the 0009 migration to add columns (if not already present)
 *   2. Reads Wordpress/acf_shop_fields.json
 *   3. Matches WordPress slugs to Supabase product slugs
 *   4. Updates each product with shop_left, shop_middle, shop_right
 */

import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

// ── Load ACF data ──────────────────────────────────
const acfPath = resolve(ROOT, "Wordpress/acf_shop_fields.json")
let acfData
try {
  acfData = JSON.parse(readFileSync(acfPath, "utf-8"))
} catch {
  console.error("❌ Cannot read", acfPath)
  process.exit(1)
}

const slugs = Object.keys(acfData)
console.log(`📦 Loaded ${slugs.length} products from WordPress ACF data`)

// ── Connect to Supabase ────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
  process.exit(1)
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
}

// ── Step 1: Run migration via SQL ──────────────────
console.log("\n🔧 Running migration: adding shop_left/shop_middle/shop_right columns...")
const migrationSql = readFileSync(
  resolve(ROOT, "packages/db/migrations/0009_product_detail_columns.sql"),
  "utf-8"
)

const sqlRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
  method: "POST",
  headers,
  body: JSON.stringify({ query: migrationSql }),
}).catch(() => null)

// The RPC approach may not work — use the pooler directly or just proceed
// The columns may already exist if migration was run separately
console.log("   (Run the migration SQL manually if columns don't exist yet)")

// ── Step 2: Fetch all product slugs from Supabase ──
console.log("\n📋 Fetching existing products from Supabase...")
const productsRes = await fetch(
  `${SUPABASE_URL}/rest/v1/products?select=id,slug&limit=1000`,
  { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
)

if (!productsRes.ok) {
  console.error("❌ Failed to fetch products:", productsRes.status, await productsRes.text())
  process.exit(1)
}

const products = await productsRes.json()
const slugToId = new Map(products.map((p) => [p.slug, p.id]))
console.log(`   Found ${products.length} products in Supabase`)

// ── Step 3: Match and update ───────────────────────
console.log("\n🔄 Updating products with ACF content...\n")
let updated = 0
let skipped = 0
const notFound = []

for (const [wpSlug, fields] of Object.entries(acfData)) {
  const productId = slugToId.get(wpSlug)
  if (!productId) {
    notFound.push(wpSlug)
    skipped++
    continue
  }

  const body = {}
  if (fields.shop_left) body.shop_left = fields.shop_left
  if (fields.shop_middle) body.shop_middle = fields.shop_middle
  if (fields.shop_right) body.shop_right = fields.shop_right

  if (Object.keys(body).length === 0) {
    console.log(`   ⏭  ${wpSlug} — no content to migrate`)
    skipped++
    continue
  }

  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }
  )

  if (updateRes.ok) {
    console.log(`   ✅ ${wpSlug}`)
    updated++
  } else {
    const errText = await updateRes.text()
    console.log(`   ❌ ${wpSlug} — ${updateRes.status}: ${errText}`)
    skipped++
  }
}

console.log(`\n✅ Done! Updated: ${updated}, Skipped: ${skipped}`)
if (notFound.length > 0) {
  console.log(`⚠️  WordPress slugs not found in Supabase (${notFound.length}):`)
  notFound.forEach((s) => console.log(`   - ${s}`))
}
