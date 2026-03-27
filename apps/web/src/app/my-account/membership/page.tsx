import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

export const metadata = { title: "會員資格 | 我的帳戶" }

interface MembershipTier {
  id: string
  name: string
  min_spend: number
  discount_rate: number
  benefits: string[]
}

interface UserProfile {
  user_id: string
  display_name: string | null
  total_spend: number
  membership_tier_id: string | null
  membership_tiers: MembershipTier | null
}

const TIER_COLORS: Record<string, string> = {
  一般會員: "secondary",
  銀卡會員: "secondary",
  金卡會員: "default",
  鑽石會員: "default",
}

const TIER_BADGE_CLASSES: Record<string, string> = {
  一般會員: "bg-zinc-200 text-zinc-700",
  銀卡會員: "bg-slate-300 text-slate-800",
  金卡會員: "bg-amber-400 text-amber-900",
  鑽石會員: "bg-sky-400 text-sky-900",
}

export default async function MembershipPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, total_spend, membership_tier_id, membership_tiers(*)")
    .eq("user_id", user.id)
    .single<UserProfile>()

  const { data: allTiers } = await supabase
    .from("membership_tiers")
    .select("id, name, min_spend, discount_rate, benefits")
    .order("min_spend", { ascending: true })

  const tiers: MembershipTier[] = allTiers ?? []
  const totalSpend: number = profile?.total_spend ?? 0
  const currentTier: MembershipTier | null = profile?.membership_tiers ?? null

  const currentTierIndex = tiers.findIndex((t) => t.id === currentTier?.id)
  const nextTier: MembershipTier | null =
    currentTierIndex >= 0 && currentTierIndex < tiers.length - 1
      ? tiers[currentTierIndex + 1]
      : null

  let progressPercent = 100
  let spendToNext: number | null = null
  if (nextTier && currentTier) {
    const range = nextTier.min_spend - currentTier.min_spend
    const progress = totalSpend - currentTier.min_spend
    progressPercent = range > 0 ? Math.min(100, Math.round((progress / range) * 100)) : 100
    spendToNext = Math.max(0, nextTier.min_spend - totalSpend)
  }

  const tierName = currentTier?.name ?? "一般會員"
  const badgeClass =
    TIER_BADGE_CLASSES[tierName] ?? "bg-zinc-200 text-zinc-700"
  const discountDisplay =
    currentTier && currentTier.discount_rate > 0
      ? `${(currentTier.discount_rate * 100).toFixed(0)}%`
      : "無折扣"

  const benefits: string[] = currentTier?.benefits ?? []

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">會員資格</h1>

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
            <span className="text-muted-foreground">會員折扣</span>
            <span className="font-semibold">{discountDisplay}</span>
          </div>

          {nextTier && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">升級進度</span>
                <span className="text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3" />
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

      {benefits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>會員專屬權益</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {benefits.map((benefit, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-primary">✓</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">等級說明</h2>
        <div className="space-y-2">
          {tiers.map((tier) => {
            const isCurrent = tier.id === currentTier?.id
            const cls = TIER_BADGE_CLASSES[tier.name] ?? "bg-zinc-200 text-zinc-700"
            return (
              <div
                key={tier.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${isCurrent ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <Badge className={cls}>{tier.name}</Badge>
                  {isCurrent && (
                    <span className="text-xs text-primary font-medium">目前等級</span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  累計 NT${tier.min_spend.toLocaleString()} 以上
                  {tier.discount_rate > 0 && (
                    <span className="ml-2 font-medium text-foreground">
                      {(tier.discount_rate * 100).toFixed(0)}% OFF
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
