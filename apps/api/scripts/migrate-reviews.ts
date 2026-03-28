import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WooReview {
  product_slug?: string
  product_name?: string
  author_name: string
  author_email: string
  rating: number
  content: string
  date?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findProductBySlugOrName(
  slug?: string,
  name?: string,
): Promise<string | null> {
  if (slug) {
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .single()
    if (data) return data.id
  }

  if (name) {
    const { data } = await supabase
      .from("products")
      .select("id")
      .ilike("name", name)
      .single()
    if (data) return data.id
  }

  return null
}

async function findUserByEmail(
  email: string,
): Promise<{ userId: string; displayName: string | null } | null> {
  // Look up user_profiles by matching auth email through the users list
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("user_id, display_name")
    .eq("email", email)
    .single()

  if (profile) {
    return { userId: profile.user_id, displayName: profile.display_name }
  }

  // Fallback: search auth users by email
  let page = 1
  while (true) {
    const { data: list, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 50,
    })
    if (error || !list) break
    const match = list.users.find((u) => u.email === email)
    if (match) return { userId: match.id, displayName: null }
    if (list.users.length < 50) break
    page++
  }

  return null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function migrateReviews() {
  const filePath = resolve(process.argv[2] || "./wordpress/reviews.json")
  console.log(`Reading reviews from ${filePath}`)

  let reviews: WooReview[]
  try {
    const raw = readFileSync(filePath, "utf-8")
    reviews = JSON.parse(raw)
  } catch (err: any) {
    console.error(`Failed to read reviews file: ${err.message}`)
    process.exit(1)
  }

  if (!Array.isArray(reviews)) {
    console.error("Expected a JSON array of reviews")
    process.exit(1)
  }

  console.log(`Found ${reviews.length} review(s) to import\n`)

  let inserted = 0
  let skipped = 0
  let failed = 0

  for (const review of reviews) {
    const label = `"${review.content?.slice(0, 40)}..." by ${review.author_email}`

    // 1. Resolve product
    const productId = await findProductBySlugOrName(
      review.product_slug,
      review.product_name,
    )
    if (!productId) {
      console.warn(
        `  SKIP  ${label} — no matching product (slug=${review.product_slug}, name=${review.product_name})`,
      )
      skipped++
      continue
    }

    // 2. Resolve user (optional — we still import even without a matched user)
    const user = await findUserByEmail(review.author_email)
    const authorName =
      user?.displayName || review.author_name || review.author_email.split("@")[0]

    // 3. Validate rating
    const rating = Math.max(1, Math.min(5, Math.round(review.rating)))

    // 4. Insert
    const row: Record<string, unknown> = {
      product_id: productId,
      author_name: authorName,
      author_email: review.author_email,
      rating,
      content: review.content,
      is_approved: true,
    }

    if (user) {
      row.user_id = user.userId
    }

    if (review.date) {
      row.created_at = review.date
    }

    const { error } = await supabase.from("product_reviews").insert(row)

    if (error) {
      console.error(`  FAIL  ${label} — ${error.message}`)
      failed++
    } else {
      console.log(`  OK    ${label}`)
      inserted++
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n--- Migration Summary ---")
  console.log(`  Total:    ${reviews.length}`)
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Skipped:  ${skipped}`)
  console.log(`  Failed:   ${failed}`)

  if (failed > 0) process.exit(1)
}

migrateReviews().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
