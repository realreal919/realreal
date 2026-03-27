import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const fromVersion = parseInt(process.env.FROM_VERSION ?? "1")
const toVersion = parseInt(process.env.TO_VERSION ?? "2")
const fromKey = process.env.FROM_ENCRYPTION_KEY!
const toKey = process.env.TO_ENCRYPTION_KEY!
const dryRun = process.env.DRY_RUN === "true"

if (!url || !key || !fromKey || !toKey) {
  console.error("Missing required env vars")
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function rotateTokens() {
  let offset = 0
  const batchSize = 50
  let totalProcessed = 0
  let totalFailed = 0

  while (true) {
    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select("id, payment_method_token, token_key_version")
      .eq("token_key_version", fromVersion)
      .not("payment_method_token", "is", null)
      .range(offset, offset + batchSize - 1)

    if (error) { console.error("Fetch error:", error); break }
    if (!subs || subs.length === 0) break

    for (const sub of subs) {
      try {
        const { data: decrypted } = await supabase.rpc("decrypt_token", { cipher_text: sub.payment_method_token, encryption_key: fromKey })
        const { data: reencrypted } = await supabase.rpc("encrypt_token", { plain_text: decrypted, encryption_key: toKey })

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from("subscriptions")
            .update({ payment_method_token: reencrypted, token_key_version: toVersion })
            .eq("id", sub.id)
            .eq("token_key_version", fromVersion)
          if (updateError) throw updateError
        }
        totalProcessed++
        console.log(`[${dryRun ? "DRY" : "LIVE"}] Rotated subscription ${sub.id}`)
      } catch (err) {
        totalFailed++
        console.error(`Failed to rotate ${sub.id}:`, err)
      }
    }

    offset += batchSize
  }

  console.log(`Done. Processed: ${totalProcessed}, Failed: ${totalFailed}`)
  if (totalFailed > 0) process.exit(1)
}

rotateTokens().catch(err => { console.error(err); process.exit(1) })
