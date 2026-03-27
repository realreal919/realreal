import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import {
  ShoppingCart,
  Package,
  Users,
  RefreshCw,
  Tag,
  FileText,
  BarChart2,
  Cpu,
  Settings,
  LayoutDashboard,
} from "lucide-react"

const NAV_ITEMS = [
  { href: "/admin", label: "概覽", icon: LayoutDashboard },
  { href: "/admin/orders", label: "訂單管理", icon: ShoppingCart },
  { href: "/admin/products", label: "商品管理", icon: Package },
  { href: "/admin/customers", label: "客戶管理", icon: Users },
  { href: "/admin/subscriptions", label: "訂閱管理", icon: RefreshCw },
  { href: "/admin/invoices", label: "發票管理", icon: FileText },
  { href: "/admin/coupons", label: "優惠券", icon: Tag },
  { href: "/admin/analytics", label: "數據分析", icon: BarChart2 },
  { href: "/admin/jobs", label: "工作佇列", icon: Cpu },
  { href: "/admin/settings", label: "系統設定", icon: Settings },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login?redirect=/admin")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single()

  if (profile?.role !== "admin") redirect("/")

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="w-56 shrink-0 bg-[#10305a] flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-white/10">
          <span className="font-semibold text-sm text-white">誠真生活 管理後台</span>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-white/50 truncate">{user.email}</div>
      </aside>

      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  )
}
