import { Badge } from "@/components/ui/badge"

export const metadata = { title: "優惠券管理 | Admin" }

interface CouponRow {
  id: string
  code: string
  type: string
  value: number
  used_count: number
  max_uses: number | null
  expires_at: string | null
  applicable_to: string | null
  is_active: boolean
}

interface CouponsResponse {
  coupons: CouponRow[]
}

const TYPE_LABEL: Record<string, string> = {
  percentage: "百分比折扣",
  fixed: "固定折扣",
  free_shipping: "免運費",
}

export default async function AdminCouponsPage() {
  const API_URL = process.env.RAILWAY_API_URL ?? "http://localhost:4000"

  let coupons: CouponRow[] = []

  try {
    const res = await fetch(`${API_URL}/admin/coupons`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 30 },
    })
    if (res.ok) {
      const data: CouponsResponse = await res.json()
      coupons = data.coupons ?? []
    }
  } catch {
    // API unavailable — show empty state
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">優惠券管理</h1>

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">代碼</th>
              <th className="px-4 py-3 text-left">類型</th>
              <th className="px-4 py-3 text-right">折扣值</th>
              <th className="px-4 py-3 text-left">使用次數</th>
              <th className="px-4 py-3 text-left">到期日</th>
              <th className="px-4 py-3 text-left">適用範圍</th>
              <th className="px-4 py-3 text-left">狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400">
                  暫無優惠券資料
                </td>
              </tr>
            ) : (
              coupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-mono font-bold">{coupon.code}</td>
                  <td className="px-4 py-3">{TYPE_LABEL[coupon.type] ?? coupon.type}</td>
                  <td className="px-4 py-3 text-right">
                    {coupon.type === "percentage"
                      ? `${coupon.value}%`
                      : coupon.type === "free_shipping"
                        ? "—"
                        : `NT$ ${coupon.value}`}
                  </td>
                  <td className="px-4 py-3">
                    {coupon.used_count}
                    {coupon.max_uses != null ? ` / ${coupon.max_uses}` : ""}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {coupon.expires_at
                      ? new Date(coupon.expires_at).toLocaleDateString("zh-TW")
                      : "無限期"}
                  </td>
                  <td className="px-4 py-3 text-xs">{coupon.applicable_to ?? "全部商品"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={coupon.is_active ? "default" : "secondary"}>
                      {coupon.is_active ? "啟用" : "停用"}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
