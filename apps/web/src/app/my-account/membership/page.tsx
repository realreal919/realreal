import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

export const metadata = { title: "會員資格 | 我的帳戶" }

interface TierBenefits {
  base_discount?: number
  rebate_rate?: number
  birthday_discount?: number
  birthday_charity_double?: boolean
  online_lectures?: boolean
  offline_events?: boolean
  birthday_gift?: boolean
  [key: string]: unknown
}

interface MembershipTier {
  id: string
  name: string
  min_spend: number
  discount_rate: number
  benefits: TierBenefits
}

interface UserProfile {
  user_id: string
  display_name: string | null
  total_spend: number
  charity_savings: number
  membership_tier_id: string | null
  membership_tiers: MembershipTier | null
}

const TIER_BADGE_CLASSES: Record<string, string> = {
  初心之友: "bg-[#10305a]/20 text-[#10305a]",
  知心之友: "bg-[#10305a]/50 text-white",
  同心之友: "bg-[#10305a] text-white",
}

const TIER_THRESHOLDS = [
  { name: "初心之友", min_spend: 0 },
  { name: "知心之友", min_spend: 3500 },
  { name: "同心之友", min_spend: 12000 },
]

function formatDiscount(rate: number): string {
  const zhe = Math.round((1 - rate) * 10)
  return `${zhe}折`
}

function describeBenefits(benefits: TierBenefits): string[] {
  const items: string[] = []
  if (benefits.base_discount) {
    items.push(`常態購物 ${formatDiscount(benefits.base_discount)}`)
  }
  if (benefits.rebate_rate) {
    items.push(`消費 ${(benefits.rebate_rate * 100).toFixed(1)}% 累積公益存款或購物金`)
  }
  if (benefits.birthday_discount) {
    items.push(`生日當月 ${formatDiscount(benefits.birthday_discount)}`)
  }
  if (benefits.birthday_charity_double) {
    items.push("生日當月公益存款雙倍累積")
  }
  if (benefits.birthday_gift) {
    items.push("專屬生日禮")
  }
  if (benefits.online_lectures) {
    items.push("線上講座參與資格")
  }
  if (benefits.offline_events) {
    items.push("線上 + 實體活動參與資格")
  }
  return items
}

export default async function MembershipPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, total_spend, charity_savings, membership_tier_id, membership_tiers(*)")
    .eq("user_id", user.id)
    .single<UserProfile>()

  const { data: allTiers } = await supabase
    .from("membership_tiers")
    .select("id, name, min_spend, discount_rate, benefits")
    .order("min_spend", { ascending: true })

  const tiers: MembershipTier[] = allTiers ?? []
  const totalSpend: number = profile?.total_spend ?? 0
  const charitySavings: number = profile?.charity_savings ?? 0
  const currentTier: MembershipTier | null = profile?.membership_tiers ?? null

  const currentTierIndex = tiers.findIndex((t) => t.id === currentTier?.id)
  const nextTier: MembershipTier | null =
    currentTierIndex >= 0 && currentTierIndex < tiers.length - 1
      ? tiers[currentTierIndex + 1]
      : null

  let progressPercent = 100
  let spendToNext: number | null = null
  if (nextTier) {
    const range = nextTier.min_spend - (currentTier?.min_spend ?? 0)
    const progress = totalSpend - (currentTier?.min_spend ?? 0)
    progressPercent = range > 0 ? Math.min(100, Math.round((progress / range) * 100)) : 100
    spendToNext = Math.max(0, nextTier.min_spend - totalSpend)
  }

  const tierName = currentTier?.name ?? "初心之友"
  const badgeClass =
    TIER_BADGE_CLASSES[tierName] ?? "bg-zinc-200 text-zinc-700"

  const tierBenefits: TierBenefits =
    (typeof currentTier?.benefits === "object" && currentTier?.benefits) ? currentTier.benefits : {}
  const benefitsList = describeBenefits(tierBenefits)

  const discountDisplay = tierBenefits.base_discount
    ? formatDiscount(tierBenefits.base_discount)
    : "95折"

  const rebateDisplay = tierBenefits.rebate_rate
    ? `${(tierBenefits.rebate_rate * 100).toFixed(1)}%`
    : "2.3%"

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6 text-[#10305a]">會員資格</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span>目前等級</span>
            <Badge className={badgeClass}>{tierName}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">累計消費</span>
            <span className="font-semibold">NT${totalSpend.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">公益存款</span>
            <span className="font-semibold">NT${charitySavings.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">會員折扣</span>
            <span className="font-semibold">{discountDisplay}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">回饋比例</span>
            <span className="font-semibold">{rebateDisplay}</span>
          </div>

          {nextTier && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">升級進度</span>
                <span className="text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3 [&>div]:bg-[#10305a]" />
              <p className="text-sm text-muted-foreground">
                再消費{" "}
                <span className="font-semibold text-foreground">
                  NT${spendToNext?.toLocaleString()}
                </span>{" "}
                升級至{" "}
                <span className="font-semibold text-foreground">{nextTier.name}</span>
              </p>
            </div>
          )}

          {!nextTier && (
            <p className="text-sm text-muted-foreground">您已是最高等級會員！</p>
          )}
        </CardContent>
      </Card>

      {benefitsList.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>會員專屬權益</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {benefitsList.map((benefit, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-[#10305a]">✓</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">等級比較</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-3 px-3 text-left text-muted-foreground font-medium">權益</th>
                {TIER_THRESHOLDS.map((t) => (
                  <th key={t.name} className="py-3 px-3 text-center font-medium">
                    <Badge className={TIER_BADGE_CLASSES[t.name] ?? "bg-zinc-200 text-zinc-700"}>
                      {t.name}
                    </Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-center">
              <tr className="border-b">
                <td className="py-3 px-3 text-left text-muted-foreground">累計消費門檻</td>
                <td className="py-3 px-3">NT$0</td>
                <td className="py-3 px-3">NT$3,500</td>
                <td className="py-3 px-3">NT$12,000</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 px-3 text-left text-muted-foreground">常態折扣</td>
                <td className="py-3 px-3">95折</td>
                <td className="py-3 px-3">95折</td>
                <td className="py-3 px-3">9折</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 px-3 text-left text-muted-foreground">回饋比例</td>
                <td className="py-3 px-3">2.3%</td>
                <td className="py-3 px-3">3.3%</td>
                <td className="py-3 px-3">3.3%</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 px-3 text-left text-muted-foreground">生日折扣</td>
                <td className="py-3 px-3">95折</td>
                <td className="py-3 px-3">9折</td>
                <td className="py-3 px-3">—</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 px-3 text-left text-muted-foreground">生日公益存款雙倍</td>
                <td className="py-3 px-3">✓</td>
                <td className="py-3 px-3">✓</td>
                <td className="py-3 px-3">✓</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 px-3 text-left text-muted-foreground">專屬生日禮</td>
                <td className="py-3 px-3">—</td>
                <td className="py-3 px-3">—</td>
                <td className="py-3 px-3">✓</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 px-3 text-left text-muted-foreground">線上講座</td>
                <td className="py-3 px-3">—</td>
                <td className="py-3 px-3">✓</td>
                <td className="py-3 px-3">✓</td>
              </tr>
              <tr>
                <td className="py-3 px-3 text-left text-muted-foreground">實體活動</td>
                <td className="py-3 px-3">—</td>
                <td className="py-3 px-3">—</td>
                <td className="py-3 px-3">✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
