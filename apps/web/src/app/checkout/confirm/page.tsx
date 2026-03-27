import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = { title: "訂單成立 | 誠真生活 RealReal" }

function getEstimatedDelivery(): string {
  const now = new Date()
  const delivery = new Date(now)
  delivery.setDate(delivery.getDate() + 5)
  // Skip to Monday if it lands on a weekend
  const day = delivery.getDay()
  if (day === 0) delivery.setDate(delivery.getDate() + 1)
  if (day === 6) delivery.setDate(delivery.getDate() + 2)
  return `${delivery.getFullYear()}/${String(delivery.getMonth() + 1).padStart(2, "0")}/${String(delivery.getDate()).padStart(2, "0")}`
}

const STEPS = [
  { num: 1, label: "收件資訊" },
  { num: 2, label: "付款方式" },
  { num: 3, label: "確認訂單" },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <nav className="mb-8" aria-label="結帳步驟">
      <ol className="flex items-center justify-center gap-0">
        {STEPS.map((step, i) => {
          const isActive = step.num === current
          const isCompleted = step.num < current
          return (
            <li key={step.num} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                        ? "bg-primary/20 text-primary"
                        : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {isCompleted ? "✓" : step.num}
                </span>
                <span
                  className={`text-sm font-medium ${
                    isActive || isCompleted ? "text-foreground" : "text-zinc-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-3 h-px w-8 sm:w-12 ${
                    step.num < current ? "bg-primary/40" : "bg-zinc-200"
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const { order } = await searchParams
  const orderNumber = order ?? "---"
  const estimatedDelivery = getEstimatedDelivery()

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <StepIndicator current={3} />

      <div className="text-center">
        {/* Success Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-10 w-10 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-2">訂單已成立！</h1>
        <p className="text-zinc-500 mb-8">
          感謝您的購買，我們將盡快為您處理。<br />
          訂單確認信已寄送至您的電子信箱。
        </p>

        {/* Order Details Card */}
        <div className="rounded-lg border bg-zinc-50/50 p-6 mb-6 text-left space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">訂單編號</p>
              <p className="font-mono font-semibold text-lg">{orderNumber}</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
              處理中
            </span>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-zinc-400 mt-0.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21M3.375 14.25h17.25M21 12.75V8.625A2.625 2.625 0 0018.375 6H5.625A2.625 2.625 0 003 8.625v4.125" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium">預計送達日期</p>
                <p className="text-sm text-zinc-500">{estimatedDelivery} 前</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-zinc-400 mt-0.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium">出貨通知</p>
                <p className="text-sm text-zinc-500">商品出貨後，我們會透過 Email 及簡訊通知您</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link href="/my-account/orders" className="block">
            <Button className="w-full">查看我的訂單</Button>
          </Link>
          <Link href="/shop" className="block">
            <Button variant="outline" className="w-full">繼續購物</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
