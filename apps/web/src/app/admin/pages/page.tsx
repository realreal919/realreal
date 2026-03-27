import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = { title: "靜態頁面管理 | Admin" }

const EDITABLE_PAGES = [
  { key: "about_page", label: "關於我們", description: "關於我們頁面內容（HTML 編輯器）" },
  { key: "faq_items", label: "常見問題", description: "FAQ 問答項目管理" },
  { key: "footer_social", label: "社群連結", description: "頁尾社群媒體連結設定" },
  { key: "seo_defaults", label: "SEO 預設", description: "全站 SEO 預設 title / description" },
]

export default function AdminPagesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[#10305a]">靜態頁面管理</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {EDITABLE_PAGES.map(({ key, label, description }) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-sm text-[#10305a]">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#687279] mb-4">{description}</p>
              <Link href={`/admin/pages/${key}`}>
                <Button variant="outline" size="sm" className="border-[#10305a] text-[#10305a] hover:bg-[#10305a]/5">
                  編輯
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
