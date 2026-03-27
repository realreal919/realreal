import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "訂單詳情 | Admin" }

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  processing: "secondary",
  shipped: "default",
  completed: "default",
  cancelled: "destructive",
  failed: "destructive",
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: order } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_items(*),
      order_addresses(*),
      payments(*),
      logistics(*),
      invoices(*)
    `
    )
    .eq("id", id)
    .single()

  if (!order) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">訂單 #{order.order_number}</h1>
          <p className="text-zinc-500 text-sm">
            {new Date(order.created_at).toLocaleString("zh-TW")}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[order.status] ?? "outline"}>{order.status}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">訂單商品</CardTitle>
          </CardHeader>
          <CardContent>
            {order.order_items?.map((item: Record<string, unknown>) => (
              <div key={item.id as string} className="flex justify-between py-1 text-sm">
                <span>
                  {(item.product_snapshot as Record<string, unknown>)?.name as string} ×{" "}
                  {item.qty as number}
                </span>
                <span>NT$ {Number(item.unit_price).toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between font-medium text-sm">
              <span>總計</span>
              <span>NT$ {Number(order.total).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">收件資訊</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {order.order_addresses
              ?.filter((a: Record<string, unknown>) => a.type === "shipping")
              .map((addr: Record<string, unknown>) => (
                <div key={addr.id as string}>
                  <p>
                    {addr.name as string} / {addr.phone as string}
                  </p>
                  <p>
                    {(addr.address as string) ||
                      `${addr.cvs_type as string} ${addr.cvs_store_id as string}`}
                  </p>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">付款資訊</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>方式：{order.payment_method}</p>
            <p>
              狀態：<Badge variant="outline">{order.payment_status}</Badge>
            </p>
            {order.payments?.[0]?.gateway_tx_id && (
              <p>交易 ID：{order.payments[0].gateway_tx_id}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">物流資訊</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {order.logistics?.[0] ? (
              <>
                <p>物流商：{order.logistics[0].provider}</p>
                <p>追蹤號：{order.logistics[0].tracking_number ?? "—"}</p>
                <p>狀態：{order.logistics[0].status}</p>
              </>
            ) : (
              <p className="text-zinc-400">尚未建立物流</p>
            )}
          </CardContent>
        </Card>

        {order.invoices?.[0] && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">發票資訊</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p>發票號碼：{order.invoices[0].invoice_number ?? "—"}</p>
              <p>
                狀態：<Badge variant="outline">{order.invoices[0].status}</Badge>
              </p>
              {order.invoices[0].issued_at && (
                <p>開立時間：{new Date(order.invoices[0].issued_at).toLocaleString("zh-TW")}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
