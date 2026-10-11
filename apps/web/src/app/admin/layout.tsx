import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { canAccessAdmin } from "@/lib/admin-access"
import { AdminSidebar } from "./AdminSidebar"

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

  // 白名單：只有 admin / editor 放行。詳細理由見 lib/admin-access.ts ——
  // 簡短版是原本只擋 viewer，而一般會員的 role 是 customer，等於全部放行。
  const role = profile?.role as string | null | undefined

  if (!canAccessAdmin(role)) redirect("/")

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <AdminSidebar role={role} userEmail={user.email ?? ""} />
      {/* pt-14 on mobile to clear the fixed header bar; md:pt-0 on desktop */}
      <main className="flex-1 min-w-0 p-4 pt-[72px] md:pt-6 md:p-6">{children}</main>
    </div>
  )
}
