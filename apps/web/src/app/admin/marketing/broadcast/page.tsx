import { AdminTabs } from "../../_components/AdminTabs"
import { BroadcastClient } from "./_client"

const MARKETING_TABS = [
  { href: "/admin/campaigns", label: "行銷活動" },
  { href: "/admin/coupons", label: "優惠券" },
  { href: "/admin/marketing/tiers", label: "會員等級" },
  { href: "/admin/marketing/points", label: "點數規則" },
  { href: "/admin/marketing/share-reports", label: "分享回報" },
  { href: "/admin/marketing/recall", label: "召回名單" },
  { href: "/admin/marketing/broadcast", label: "制度更新通知" },
]

export const metadata = { title: "會員制度更新通知 | Admin" }

export default function AdminBroadcastPage() {
  return (
    <div className="space-y-4">
      <AdminTabs tabs={MARKETING_TABS} />
      <div>
        <h1 className="text-2xl font-bold text-[#10305a]">會員制度更新通知（一次性）</h1>
        <p className="mt-1 text-sm text-zinc-500">
          寄給所有沒退訂行銷的會員，隨信發一張老朋友感謝券（滿 1500 折 100、60 天）。
          <strong>寄出去收不回來</strong>——先用「測試寄給自己」看過實際長相，再分批正式寄出。
        </p>
      </div>
      <BroadcastClient />
    </div>
  )
}
