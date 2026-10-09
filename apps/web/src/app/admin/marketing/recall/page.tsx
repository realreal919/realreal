import { AdminTabs } from "../../_components/AdminTabs"
import { RecallClient } from "./_client"

const MARKETING_TABS = [
  { href: "/admin/campaigns", label: "行銷活動" },
  { href: "/admin/coupons", label: "優惠券" },
  { href: "/admin/marketing/tiers", label: "會員等級" },
  { href: "/admin/marketing/points", label: "點數規則" },
  { href: "/admin/marketing/share-reports", label: "分享回報" },
  { href: "/admin/marketing/recall", label: "召回名單" },
]

export const metadata = { title: "召回名單 | Admin" }

export default function AdminRecallPage() {
  return (
    <div className="space-y-4">
      <AdminTabs tabs={MARKETING_TABS} />
      <div>
        <h1 className="text-2xl font-bold text-[#10305a]">召回名單（一次性）</h1>
        <p className="mt-1 text-sm text-zinc-500">
          只買過一次、首購距今 15–90 天的會員。這裡只產名單，<strong>不會自動寄信</strong>
          ——寄出後再按「標記為已寄出」，名單才會把他們移除。首購 14 天內的人不在這裡，自動回購提醒會接手。
        </p>
      </div>
      <RecallClient />
    </div>
  )
}
