import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"

export const metadata = { title: "客戶管理 | Admin" }

export default async function AdminCustomersPage() {
  const supabase = await createClient()
  const { data: customers } = await supabase
    .from("user_profiles")
    .select(
      `
      user_id, display_name, phone, total_spend, role, created_at,
      membership_tiers(name)
    `
    )
    .order("total_spend", { ascending: false })
    .limit(500)

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-[#10305a]">客戶管理</h1>
      <p className="text-sm text-[#687279] mb-4">共 {customers?.length ?? 0} 位客戶</p>
      <div className="border rounded-[10px] overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#10305a]/5 text-[#10305a] text-xs">
            <tr>
              <th className="px-4 py-3 text-left font-medium">姓名</th>
              <th className="px-4 py-3 text-left font-medium">電話</th>
              <th className="px-4 py-3 text-left font-medium">會員等級</th>
              <th className="px-4 py-3 text-left font-medium">角色</th>
              <th className="px-4 py-3 text-right font-medium">累計消費</th>
              <th className="px-4 py-3 text-left font-medium">加入日期</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!customers || customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#687279]">
                  暫無客戶資料
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.user_id} className="hover:bg-[#fffeee]/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#10305a]">{c.display_name ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-[#687279]">
                    {c.phone || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="border-[#10305a]/20 text-[#10305a]">
                      {(c.membership_tiers as unknown as { name: string } | null)?.name ?? "一般會員"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        c.role === "admin"
                          ? "bg-[#10305a] text-white"
                          : c.role === "editor"
                            ? "bg-[#10305a]/70 text-white"
                            : "bg-gray-100 text-[#687279]"
                      }
                    >
                      {c.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-[#10305a] font-medium">
                    NT$ {Number(c.total_spend ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[#687279] text-xs">
                    {new Date(c.created_at).toLocaleDateString("zh-TW")}
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
