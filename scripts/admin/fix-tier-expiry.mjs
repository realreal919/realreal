/**
 * 補上「有等級但沒有效期」的會員效期。
 *
 * 手動從後台改等級時只寫了 membership_tier_id、沒寫 tier_expires_at，而每天
 * 04:00 的降等排程只看「效期已過」的人，效期是空的就永遠掃不到，等級等於永久
 * 保留。2026-10-07 有 4 位知心之友是這個狀態。
 *
 * 寫入內容：只動 tier_expires_at，設為「今天 + 該等級的 validity_months」。
 * tier_started_at（原升等日）與 tier_period_spend（本期累計消費）都不動 ——
 * 歸零會抹掉真實的消費紀錄。
 *
 * 用法：
 *   node scripts/admin/fix-tier-expiry.mjs            # 只試算，不寫入
 *   node scripts/admin/fix-tier-expiry.mjs --apply    # 實際寫入
 */
import { sb, APPLY } from "./_sb.mjs"

const tiers = await sb("/membership_tiers?select=id,name,validity_months,min_spend")
const byId = Object.fromEntries(tiers.map((t) => [t.id, t]))
const base = tiers.slice().sort((a, b) => Number(a.min_spend) - Number(b.min_spend))[0]

const rows = await sb(
  "/user_profiles?select=user_id,display_name,membership_tier_id,total_spend,tier_period_spend,tier_started_at,tier_expires_at&role=eq.customer&tier_expires_at=is.null&limit=1000",
)

const targets = rows.filter((r) => {
  const tier = byId[r.membership_tier_id]
  // 最低等級（初心之友）本來就不過期，不該被補上效期。
  return tier && tier.id !== base.id && Number(tier.validity_months ?? 0) > 0
})

if (targets.length === 0) {
  console.log("沒有需要補效期的會員。")
  process.exit(0)
}

const now = new Date()
console.log(APPLY ? "── 實際寫入 ──" : "── 試算（沒有 --apply，不會寫入）──")
for (const r of targets) {
  const tier = byId[r.membership_tier_id]
  const exp = new Date(now)
  exp.setMonth(exp.getMonth() + Number(tier.validity_months))
  const line = [
    (r.display_name || "(無名)").padEnd(12),
    tier.name,
    "累計 " + Math.round(r.total_spend),
    "本期 " + Math.round(r.tier_period_spend ?? 0),
    "升等於 " + String(r.tier_started_at ?? "").slice(0, 10),
    "效期 無 → " + exp.toISOString().slice(0, 10),
  ].join(" | ")
  if (APPLY) {
    await sb(`/user_profiles?user_id=eq.${r.user_id}`, {
      method: "PATCH",
      body: JSON.stringify({ tier_expires_at: exp.toISOString() }),
    })
  }
  console.log(" ", line)
}
console.log(`共 ${targets.length} 筆${APPLY ? "，已寫入" : "（試算）"}`)
