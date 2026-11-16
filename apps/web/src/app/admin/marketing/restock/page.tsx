import { AdminTabs } from "../../_components/AdminTabs"
import { MARKETING_TABS } from "../../_components/marketing-tabs"
import { RestockClient } from "./_client"

export const metadata = { title: "到貨通知 | Admin" }

export default function AdminRestockPage() {
  return (
    <div className="space-y-4">
      <AdminTabs tabs={MARKETING_TABS} />
      <div>
        <h1 className="text-2xl font-bold text-[#10305a]">到貨通知</h1>
        <p className="mt-1 text-sm text-zinc-500">
          客人在缺貨的商品頁留下的信箱。<strong>不會自動寄信</strong> ——
          補貨數量常常不夠所有人，所以等你確認貨真的到了、數量也夠，再按「通知他們」。
          寄出後那些人就從名單移除，每個人只會收到一次。
        </p>
      </div>
      <RestockClient />
    </div>
  )
}
