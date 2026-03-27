import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import TierSettingsForm from "./_components/tier-settings-form"
import SiteNoticeForm from "./_components/site-notice-form"

export const metadata = { title: "系統設定 | Admin" }

export default async function AdminSettingsPage() {
  const supabase = await createClient()

  const [{ data: tiers }, { data: siteNoticeSetting }] = await Promise.all([
    supabase.from("membership_tiers").select("*").order("sort_order"),
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "site_notice")
      .maybeSingle(),
  ])

  const siteNotice = siteNoticeSetting?.value as {
    message: string
    active: boolean
    variant: "info" | "warning" | "success"
  } | null

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">系統設定</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">會員等級設定</CardTitle>
        </CardHeader>
        <CardContent>
          <TierSettingsForm tiers={tiers ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">站台公告橫幅</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteNoticeForm
            message={siteNotice?.message ?? ""}
            active={siteNotice?.active ?? false}
            variant={siteNotice?.variant ?? "info"}
          />
        </CardContent>
      </Card>
    </div>
  )
}
