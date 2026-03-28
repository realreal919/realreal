import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import SiteNoticeForm from "./_components/site-notice-form"

export const metadata = { title: "系統設定 | Admin" }

export default async function AdminSettingsPage() {
  const supabase = await createClient()

  const { data: siteNoticeSetting } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "site_notice")
    .maybeSingle()

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
