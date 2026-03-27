import { createClient } from "@/lib/supabase/server"

export const metadata = { title: "Admin 概覽 | 誠真生活" }

export default async function AdminPage() {
  const supabase = await createClient()
  const [
    { count: orderCount },
    { count: productCount },
    { count: subCount },
    { count: customerCount },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("user_profiles").select("*", { count: "exact", head: true }),
  ])

  const stats = [
    { label: "總訂單", value: orderCount ?? 0 },
    { label: "上架商品", value: productCount ?? 0 },
    { label: "活躍訂閱", value: subCount ?? 0 },
    { label: "會員數", value: customerCount ?? 0 },
  ]

  return (
    <div className="p-2">
      <h1 className="text-2xl font-bold mb-6 text-[#10305a]">後台概覽</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-[#10305a]/10 rounded-[10px] p-6 bg-white shadow-sm">
            <p className="text-3xl font-bold text-[#10305a]">{s.value.toLocaleString()}</p>
            <p className="text-sm text-[#687279] mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
