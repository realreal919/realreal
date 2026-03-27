import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getRevenueByDay,
  getOrdersByStatus,
  getTopProducts,
  getMembershipTierDistribution,
  getSubscriptionMRR,
} from "./_lib/queries"
import RevenueChart from "./_components/revenue-chart"
import OrderStatusPie from "./_components/order-status-pie"

export const metadata = { title: "數據分析 | Admin" }

export default async function AdminAnalyticsPage() {
  const [revenueData, ordersByStatus, topProducts, tierDistribution, mrr] = await Promise.all([
    getRevenueByDay(30),
    getOrdersByStatus(),
    getTopProducts(10),
    getMembershipTierDistribution(),
    getSubscriptionMRR(),
  ])

  const totalRevenue = revenueData.reduce((s, d) => s + d.revenue, 0)
  const totalOrders = ordersByStatus.reduce((s, d) => s + d.count, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">數據分析</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-zinc-500">30 日營收</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            NT$ {totalRevenue.toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-zinc-500">訂閱 MRR</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">NT$ {mrr.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-zinc-500">總訂單數</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totalOrders}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs text-zinc-500">已完成訂單</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {ordersByStatus.find((o) => o.status === "completed")?.count ?? 0}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">30 日每日營收</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">訂單狀態分佈</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderStatusPie data={ordersByStatus} />
          </CardContent>
        </Card>
      </div>

      {/* Top products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">熱銷商品 Top 10</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs border-b">
                <th className="text-left py-2">商品</th>
                <th className="text-right py-2">銷售量</th>
                <th className="text-right py-2">營收</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {topProducts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-zinc-400">
                    暫無資料
                  </td>
                </tr>
              ) : (
                topProducts.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-right">{p.qty}</td>
                    <td className="py-2 text-right">NT$ {p.revenue.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Tier distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">會員等級分佈</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6 flex-wrap">
            {tierDistribution.length === 0 ? (
              <p className="text-zinc-400 text-sm">暫無資料</p>
            ) : (
              tierDistribution.map((t) => (
                <div key={t.tier} className="text-center">
                  <p className="text-2xl font-bold">{t.count}</p>
                  <p className="text-zinc-500 text-xs">{t.tier}</p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
