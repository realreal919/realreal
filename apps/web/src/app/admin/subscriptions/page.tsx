import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "訂閱管理 | Admin" }

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  cancelled: "secondary",
  past_due: "destructive",
  paused: "outline",
}

const STATUS_TABS = [
  { label: "全部", value: "" },
  { label: "活躍", value: "active" },
  { label: "逾期", value: "past_due" },
  { label: "暫停", value: "paused" },
  { label: "已取消", value: "cancelled" },
]

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from("subscriptions")
    .select(
      `
      id, status, next_billing_date, retry_count, created_at,
      user_profiles(display_name, email),
      subscription_plans(name, price)
    `
    )
    .order("created_at", { ascending: false })
    .limit(500)

  if (params.status) query = query.eq("status", params.status)

  const { data: subscriptions } = await query

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">訂閱管理</h1>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_TABS.map((tab) => {
          const isActive = (params.status ?? "") === tab.value
          const href = tab.value
            ? `/admin/subscriptions?status=${tab.value}`
            : "/admin/subscriptions"
          return (
            <Link
              key={tab.value}
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                isActive
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">會員</th>
              <th className="px-4 py-3 text-left">方案</th>
              <th className="px-4 py-3 text-left">狀態</th>
              <th className="px-4 py-3 text-left">下次扣款</th>
              <th className="px-4 py-3 text-left">重試次數</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {!subscriptions || subscriptions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  暫無訂閱資料
                </td>
              </tr>
            ) : (
              subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {(sub.user_profiles as unknown as { display_name: string; email: string } | null)
                        ?.display_name ?? "—"}
                    </p>
                    <p className="text-zinc-400 text-xs">
                      {(sub.user_profiles as unknown as { email: string } | null)?.email}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {(sub.subscription_plans as unknown as { name: string; price: number } | null)?.name ??
                      "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[sub.status] ?? "outline"}>{sub.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {sub.next_billing_date
                      ? new Date(sub.next_billing_date).toLocaleDateString("zh-TW")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {sub.retry_count > 0 ? (
                      <Badge variant="destructive">{sub.retry_count}</Badge>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/subscriptions/${sub.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      管理
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
