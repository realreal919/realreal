import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes("--dry-run")
const inputPathIndex = process.argv.indexOf("--input")
const INPUT_PATH =
  inputPathIndex !== -1 && process.argv[inputPathIndex + 1]
    ? process.argv[inputPathIndex + 1]
    : "./wordpress/users.json"

if (DRY_RUN) {
  console.log("** DRY-RUN MODE — no data will be written **\n")
}

// ---------------------------------------------------------------------------
// Env
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
interface WpUser {
  email: string
  display_name?: string
  phone?: string
  birthday?: string        // ISO date string e.g. "1990-01-15"
  tax_id?: string
  membership_tier_id?: string  // UUID of an existing membership_tiers row
}

interface MigrationResult {
  email: string
  temp_password: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateTempPassword(): string {
  return randomBytes(16).toString("base64url")
}

async function emailAlreadyExists(email: string): Promise<boolean> {
  let page = 1
  while (true) {
    const { data: existing, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 50,
    })
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`)
    }
    if (existing.users.find((u) => u.email === email)) return true
    if (existing.users.length < 50) break
    page++
  }
  return false
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function migrateUsers() {
  // 1. Read JSON input
  let wpUsers: WpUser[]
  try {
    const raw = readFileSync(INPUT_PATH, "utf-8")
    wpUsers = JSON.parse(raw)
  } catch (err) {
    console.error(`Failed to read input file "${INPUT_PATH}":`, err)
    process.exit(1)
  }

  if (!Array.isArray(wpUsers) || wpUsers.length === 0) {
    console.error("Input file must contain a non-empty JSON array of users")
    process.exit(1)
  }

  console.log(`Found ${wpUsers.length} user(s) in ${INPUT_PATH}\n`)

  const succeeded: MigrationResult[] = []
  let skipped = 0
  let failed = 0

  for (const wp of wpUsers) {
    if (!wp.email) {
      console.warn("SKIP  — entry missing email field:", JSON.stringify(wp))
      failed++
      continue
    }

    try {
      // Check for existing user
      const exists = await emailAlreadyExists(wp.email)
      if (exists) {
        console.log(`SKIP  ${wp.email} — already exists`)
        skipped++
        continue
      }

      const tempPassword = generateTempPassword()

      if (DRY_RUN) {
        console.log(`DRY   ${wp.email} — would create auth user + profile`)
        succeeded.push({ email: wp.email, temp_password: tempPassword })
        continue
      }

      // 2a. Create Supabase Auth user
      const { data: { user }, error: authError } =
        await supabase.auth.admin.createUser({
          email: wp.email,
          password: tempPassword,
          email_confirm: true,
        })

      if (authError || !user) {
        console.error(`FAIL  ${wp.email} — auth: ${authError?.message}`)
        failed++
        continue
      }

      // 2b. Create user_profiles record
      const { error: profileError } = await supabase
        .from("user_profiles")
        .upsert(
          {
            user_id: user.id,
            display_name: wp.display_name ?? null,
            phone: wp.phone ?? null,
            birthday: wp.birthday ?? null,
            tax_id: wp.tax_id ?? null,
            role: "customer",
            membership_tier_id: wp.membership_tier_id ?? null,
          },
          { onConflict: "user_id" },
        )

      if (profileError) {
        console.error(`FAIL  ${wp.email} — profile: ${profileError.message}`)
        failed++
        continue
      }

      console.log(`OK    ${wp.email}`)
      succeeded.push({ email: wp.email, temp_password: tempPassword })
    } catch (err) {
      console.error(`FAIL  ${wp.email} — unexpected:`, err)
      failed++
    }
  }

  // 3. Summary
  console.log("\n--- Migration summary ---")
  console.log(`  Total:   ${wpUsers.length}`)
  console.log(`  Created: ${succeeded.length}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Failed:  ${failed}`)

  // 4. Write CSV of email + temp_password for password-reset mailing
  if (succeeded.length > 0) {
    const csvLines = ["email,temp_password"]
    for (const r of succeeded) {
      csvLines.push(`${r.email},${r.temp_password}`)
    }
    const csvPath = DRY_RUN
      ? "./migrated-users-dry-run.csv"
      : "./migrated-users.csv"
    writeFileSync(csvPath, csvLines.join("\n") + "\n", "utf-8")
    console.log(`\nCSV written to ${csvPath}`)
  }
}

migrateUsers().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
