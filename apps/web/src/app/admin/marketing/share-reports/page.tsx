import { AdminTabs } from "../../_components/AdminTabs"
import { ShareReportsClient } from "./_client"

const MARKETING_TABS = [
  { href: "/admin/campaigns", label: "行銷活動" },
  { href: "/admin/coupons", label: "優惠券" },
  { href: "/admin/marketing/tiers", label: "會員等級" },
  { href: "/admin/marketing/points", label: "點數規則" },
  { href: "/admin/marketing/share-reports", label: "分享回報" },
  { href: "/admin/marketing/recall", label: "召回名單" },
  { href: "/admin/marketing/broadcast", label: "制度更新通知" },
]

export const metadata = { title: "分享回報 | Admin" }

export default function AdminShareReportsPage() {
  return (
    <div className="space-y-4">
      <AdminTabs tabs={MARKETING_TABS} />
      <div>
        <h1 className="text-2xl font-bold text-[#10305a]">分享回報</h1>
        <p className="mt-1 text-sm text-zinc-500">
          會員回報的分享。點開連結或截圖確認後選類型，點數、每月上限與升等資格都自動算。
        </p>
      </div>
      <ShareReportsClient />
    </div>
  )
}
