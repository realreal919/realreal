import { AdminTabs } from "../../_components/AdminTabs"
import { MARKETING_TABS } from "../../_components/marketing-tabs"
import { BroadcastClient } from "./_client"

export const metadata = { title: "寄信給客人 | Admin" }

export default function AdminBroadcastPage() {
  return (
    <div className="space-y-4">
      <AdminTabs tabs={MARKETING_TABS} />
      <div>
        <h1 className="text-2xl font-bold text-[#10305a]">寄信給客人</h1>
        <p className="mt-1 text-sm text-zinc-500">
          這一頁的每一種信<strong>寄出去都收不回來</strong>——先用「測試寄給自己」或「查名單」
          確認過，再正式寄出。每天的寄信額度是跟訂單確認信、出貨通知信共用的。
        </p>
      </div>
      <BroadcastClient />
    </div>
  )
}
