import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "客戶管理 | Admin" }

export default async function AdminCustomersPage() {
  const supabase = await createClient()
  const { data: customers } = await supabase
    .from("user_profiles")
    .select(
      `
      id, display_name, email, total_spend, created_at,
      membership_tiers(name)
    `
    )
    .order("total_spend", { ascending: false })
    .limit(500)

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">客戶管理</h1>
      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">姓名 / Email</th>
              <th className="px-4 py-3 text-left">會員等級</th>
              <th className="px-4 py-3 text-right">累計消費</th>
              <th className="px-4 py-3 text-left">加入日期</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {!customers || customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  暫無客戶資料
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.display_name ?? "—"}</p>
                    <p className="text-zinc-400 text-xs">{c.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {(c.membership_tiers as unknown as { name: string } | null)?.name ?? "一般會員"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    NT$ {Number(c.total_spend ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(c.created_at).toLocaleDateString("zh-TW")}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      查看
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
