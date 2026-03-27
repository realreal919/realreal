import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import {
  LayoutDashboard,
  ShoppingCart,
  RefreshCw,
  Crown,
  User,
  MapPin,
} from "lucide-react"

const NAV_ITEMS = [
  { href: "/my-account", label: "帳戶總覽", icon: LayoutDashboard },
  { href: "/my-account/orders", label: "我的訂單", icon: ShoppingCart },
  { href: "/my-account/subscriptions", label: "我的訂閱", icon: RefreshCw },
  { href: "/my-account/membership", label: "會員等級", icon: Crown },
  { href: "/my-account/profile", label: "個人資料", icon: User },
  { href: "/my-account/addresses", label: "收件地址", icon: MapPin },
]

export default async function MyAccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login?redirect=/my-account")

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Mobile: horizontal scrollable tabs */}
      <div className="md:hidden border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <nav className="flex overflow-x-auto gap-1 py-2 -mx-4 px-4 scrollbar-hide">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Desktop: sidebar + content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex gap-8">
          {/* Sidebar - desktop only */}
          <aside className="hidden md:block w-56 shrink-0">
            <div className="sticky top-8">
              <h2 className="text-lg font-semibold mb-4 px-3">我的帳戶</h2>
              <nav className="space-y-0.5">
                {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 px-3 pt-4 border-t border-zinc-200 text-xs text-zinc-400 truncate">
                {user.email}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}
