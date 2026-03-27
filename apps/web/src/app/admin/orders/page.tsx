import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "訂單管理 | Admin" }

const STATUS_TABS = [
  { label: "全部", value: "" },
  { label: "待付款", value: "pending" },
  { label: "處理中", value: "processing" },
  { label: "已出貨", value: "shipped" },
  { label: "已完成", value: "completed" },
  { label: "已取消", value: "cancelled" },
]

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  processing: "secondary",
  shipped: "default",
  completed: "default",
  cancelled: "destructive",
  failed: "destructive",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  processing: "處理中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失敗",
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; payment?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, payment_method, total, created_at, user_profiles(display_name, email)"
    )
    .order("created_at", { ascending: false })
    .limit(200)

  if (params.status) query = query.eq("status", params.status)
  if (params.payment) query = query.eq("payment_status", params.payment)
  if (params.from) query = query.gte("created_at", params.from)
  if (params.to) query = query.lte("created_at", params.to)

  const { data: orders } = await query

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">訂單管理</h1>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_TABS.map((tab) => {
          const isActive = (params.status ?? "") === tab.value
          const href = tab.value ? `/admin/orders?status=${tab.value}` : "/admin/orders"
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
              <th className="px-4 py-3 text-left">訂單號</th>
              <th className="px-4 py-3 text-left">顧客</th>
              <th className="px-4 py-3 text-left">狀態</th>
              <th className="px-4 py-3 text-right">金額</th>
              <th className="px-4 py-3 text-left">時間</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {!orders || orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  暫無訂單
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const profile = order.user_profiles as unknown as
                  | { display_name: string | null; email: string }
                  | null
                return (
                  <tr key={order.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-mono text-xs">{order.order_number}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-xs">{profile?.display_name ?? "訪客"}</p>
                      <p className="text-zinc-400 text-xs">{profile?.email ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[order.status] ?? "outline"}>
                        {STATUS_LABEL[order.status] ?? order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      NT$ {Number(order.total).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {new Date(order.created_at).toLocaleDateString("zh-TW")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        查看
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
