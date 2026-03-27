import { createClient } from "@supabase/supabase-js"

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
  console.error("❌ Refusing to seed in production. Set ALLOW_SEED=true to override.")
  process.exit(1)
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("❌ Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars")
  process.exit(1)
}

async function seedAdmin() {
  // Check if user already exists — paginate through all users
  let page = 1
  let found = false
  while (true) {
    const { data: existing, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
    if (error) { console.error("❌ Failed to list users:", error.message); process.exit(1) }
    if (existing.users.find(u => u.email === ADMIN_EMAIL)) { found = true; break }
    if (existing.users.length < 50) break  // last page
    page++
  }
  if (found) {
    console.log(`✓ Admin ${ADMIN_EMAIL} already exists — skipping`)
    return
  }

  const { data: { user }, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true,
  })
  if (error || !user) { console.error("❌", error?.message); process.exit(1) }

  const { error: profileError } = await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id, display_name: "Admin", role: "admin" }, { onConflict: "user_id" })
  if (profileError) { console.error("❌", profileError.message); process.exit(1) }

  console.log(`✓ Admin created: ${ADMIN_EMAIL}`)
}

seedAdmin().catch(err => {
  console.error("❌ Unexpected error:", err)
  process.exit(1)
})
