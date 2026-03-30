import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

// ---------------------------------------------------------------------------
// Environment & Supabase client (mirrors seed-admin.ts)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const includeExpired = args.includes("--include-expired")
const inputFileArg = args.find((a) => !a.startsWith("--"))
const inputFile = path.resolve(inputFileArg ?? "./wordpress/coupons.json")

// ---------------------------------------------------------------------------
// WooCommerce coupon type mapping
// ---------------------------------------------------------------------------

const TYPE_MAP: Record<string, "percentage" | "fixed"> = {
  percent_discount: "percentage",
  percent: "percentage",
  percentage: "percentage",
  fixed_cart: "fixed",
  fixed_product: "fixed",
  fixed: "fixed",
}

const VALID_APPLICABLE_TO = new Set(["order", "subscription", "both"])

// ---------------------------------------------------------------------------
// WooCommerce coupon shape (loose — we only read what we need)
// ---------------------------------------------------------------------------

interface WooCoupon {
  code: string
  discount_type?: string
  amount?: string | number
  minimum_amount?: string | number
  usage_limit?: number | null
  usage_count?: number
  date_expires?: string | null
  expiry_date?: string | null
  /** Custom field that may exist in exported data */
  applicable_to?: string
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function migrateCoupons() {
  // 1. Read input file
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`)
    console.error("Provide a path as argument or place coupons at ./wordpress/coupons.json")
    console.error("See scripts/templates/coupons-template.json for the expected format.")
    process.exit(1)
  }

  const raw = fs.readFileSync(inputFile, "utf-8")
  let coupons: WooCoupon[]
  try {
    coupons = JSON.parse(raw)
    if (!Array.isArray(coupons)) {
      throw new Error("Expected top-level JSON array")
    }
  } catch (err) {
    console.error(`Failed to parse ${inputFile}: ${(err as Error).message}`)
    process.exit(1)
  }

  console.log(`Found ${coupons.length} coupon(s) in ${inputFile}`)
  if (includeExpired) {
    console.log("  --include-expired: expired coupons will be imported")
  }

  // 2. Process each coupon
  let imported = 0
  let skipped = 0
  let errors = 0
  const now = new Date()

  for (const wc of coupons) {
    const label = wc.code ?? "(no code)"

    // --- code is required ---
    if (!wc.code || wc.code.trim() === "") {
      console.warn(`  SKIP  [${label}] missing code`)
      skipped++
      continue
    }

    // --- map type ---
    const mappedType = TYPE_MAP[(wc.discount_type ?? "").toLowerCase()]
    if (!mappedType) {
      console.warn(`  SKIP  [${label}] unknown discount_type "${wc.discount_type}"`)
      skipped++
      continue
    }

    // --- parse value ---
    const value = Number(wc.amount ?? 0)
    if (!value || value <= 0) {
      console.warn(`  SKIP  [${label}] invalid amount "${wc.amount}"`)
      skipped++
      continue
    }

    // --- expiry ---
    const expiresRaw = wc.date_expires ?? wc.expiry_date ?? null
    let expiresAt: string | null = null
    if (expiresRaw) {
      const d = new Date(expiresRaw)
      if (isNaN(d.getTime())) {
        console.warn(`  SKIP  [${label}] invalid expiry date "${expiresRaw}"`)
        skipped++
        continue
      }
      if (!includeExpired && d < now) {
        console.warn(`  SKIP  [${label}] expired on ${d.toISOString()}`)
        skipped++
        continue
      }
      expiresAt = d.toISOString()
    }

    // --- other fields ---
    const minOrder = Number(wc.minimum_amount ?? 0)
    const maxUses = wc.usage_limit ?? null
    const usedCount = Number(wc.usage_count ?? 0)
    const applicableTo =
      wc.applicable_to && VALID_APPLICABLE_TO.has(wc.applicable_to)
        ? wc.applicable_to
        : "order"

    // 3. Insert into coupons table
    const { error } = await supabase.from("coupons").insert({
      code: wc.code.toUpperCase().trim(),
      type: mappedType,
      value,
      min_order: minOrder,
      max_uses: maxUses,
      used_count: usedCount,
      expires_at: expiresAt,
      applicable_to: applicableTo,
    })

    if (error) {
      // Duplicate code is the most likely conflict — log but continue
      console.error(`  ERROR [${label}] ${error.message}`)
      errors++
      continue
    }

    console.log(`  OK    [${wc.code.toUpperCase().trim()}] ${mappedType} ${value}`)
    imported++
  }

  // 4. Summary
  console.log("")
  console.log("--- Migration summary ---")
  console.log(`  Imported : ${imported}`)
  console.log(`  Skipped  : ${skipped}`)
  console.log(`  Errors   : ${errors}`)
  console.log(`  Total    : ${coupons.length}`)

  if (errors > 0) {
    process.exit(1)
  }
}

migrateCoupons().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
