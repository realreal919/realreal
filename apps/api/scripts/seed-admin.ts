import { createClient } from "@supabase/supabase-js"

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
  console.error("❌ Refusing to seed in production. Set ALLOW_SEED=true to override.")
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("❌ Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars")
  process.exit(1)
}

async function seedAdmin() {
  const { data: existing } = await supabase.auth.admin.listUsers()
  if (existing?.users?.find(u => u.email === ADMIN_EMAIL)) {
    console.log(`✓ Admin ${ADMIN_EMAIL} already exists — skipping`)
    return
  }

  const { data: { user }, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true,
  })
  if (error || !user) { console.error("❌", error?.message); process.exit(1) }

  const { error: profileError } = await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id, display_name: "Admin", role: "admin" })
  if (profileError) { console.error("❌", profileError.message); process.exit(1) }

  console.log(`✓ Admin created: ${ADMIN_EMAIL}`)
}

seedAdmin()
