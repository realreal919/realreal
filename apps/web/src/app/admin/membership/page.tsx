import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "會員分析 | Admin" }

const TIER_BADGE_CLASSES: Record<string, string> = {
  一般會員: "bg-zinc-200 text-zinc-700",
  銀卡會員: "bg-slate-300 text-slate-800",
  金卡會員: "bg-amber-400 text-amber-900",
  鑽石會員: "bg-sky-400 text-sky-900",
}

interface TierDistributionRow {
  tier_name: string
  member_count: number
  percentage: number
}

interface TopCustomerRow {
  display_name: string | null
  total_spend: number
  tier_name: string | null
}

interface AnalyticsResponse {
  tier_distribution: TierDistributionRow[]
  top_customers: TopCustomerRow[]
}

export default async function AdminMembershipPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single<{ role: string }>()
  if (profile?.role !== "admin") redirect("/")

  const API_URL = process.env.RAILWAY_API_URL ?? "http://localhost:4000"

  let tierDistribution: TierDistributionRow[] = []
  let topCustomers: TopCustomerRow[] = []

  try {
    const res = await fetch(`${API_URL}/admin/analytics/membership`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    })
    if (res.ok) {
      const data: AnalyticsResponse = await res.json()
      tierDistribution = data.tier_distribution ?? []
      topCustomers = data.top_customers ?? []
    }
  } catch {
    // API unavailable — show empty state
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">會員分析</h1>

      {/* Tier Distribution */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">等級分佈</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium">等級</th>
                <th className="text-right px-4 py-3 font-medium">人數</th>
                <th className="text-right px-4 py-3 font-medium">佔比</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tierDistribution.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                    暫無資料
                  </td>
                </tr>
              ) : (
                tierDistribution.map((row) => {
                  const badgeClass =
                    TIER_BADGE_CLASSES[row.tier_name] ?? "bg-zinc-200 text-zinc-700"
                  return (
                    <tr key={row.tier_name}>
                      <td className="px-4 py-3">
                        <Badge className={badgeClass}>{row.tier_name}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {row.member_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {row.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top 10 Customers */}
      <section>
        <h2 className="text-lg font-semibold mb-4">消費前 10 名會員</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium">排名</th>
                <th className="text-left px-4 py-3 font-medium">姓名</th>
                <th className="text-right px-4 py-3 font-medium">累計消費</th>
                <th className="text-left px-4 py-3 font-medium">等級</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    暫無資料
                  </td>
                </tr>
              ) : (
                topCustomers.map((customer, idx) => {
                  const tierName = customer.tier_name ?? "一般會員"
                  const badgeClass =
                    TIER_BADGE_CLASSES[tierName] ?? "bg-zinc-200 text-zinc-700"
                  return (
                    <tr key={idx}>
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">
                        {customer.display_name ?? "（未設定）"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        NT${customer.total_spend.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={badgeClass}>{tierName}</Badge>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
