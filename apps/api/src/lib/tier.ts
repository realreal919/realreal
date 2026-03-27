import { supabase } from "./supabase"

const TIERS = [
  { name: "鑽石會員", minSpend: 30000 },
  { name: "金卡會員", minSpend: 10000 },
  { name: "銀卡會員", minSpend: 3000 },
  { name: "一般會員", minSpend: 0 },
] as const

export async function upgradeTierIfNeeded(userId: string, newTotalSpend: number) {
  // Fetch all tiers ordered by min_spend DESC
  const { data: tiers } = await supabase
    .from("membership_tiers")
    .select("id, name, min_spend")
    .order("min_spend", { ascending: false })
  if (!tiers) return

  const eligible = tiers.find((t: { id: string; name: string; min_spend: number }) => newTotalSpend >= Number(t.min_spend))
  if (!eligible) return

  await supabase
    .from("user_profiles")
    .update({ membership_tier_id: eligible.id, total_spend: newTotalSpend })
    .eq("user_id", userId)
}

export async function incrementSpendAndUpgrade(userId: string, amount: number) {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("total_spend")
    .eq("user_id", userId)
    .single()

  const currentSpend = Number(profile?.total_spend ?? 0)
  const newSpend = currentSpend + amount
  await upgradeTierIfNeeded(userId, newSpend)
}

/** Pure helper — compute which tier name applies given a spend amount and a sorted tiers list */
export function computeNewTier(
  totalSpend: number,
  tiers: Array<{ id: string; name: string; min_spend: number }>,
): { id: string; name: string; min_spend: number } | undefined {
  // Assumes tiers are already ordered by min_spend DESC
  return tiers.find((t) => totalSpend >= Number(t.min_spend))
}
