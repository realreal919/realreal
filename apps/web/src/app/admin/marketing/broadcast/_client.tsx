"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
// 瀏覽器端元件不能用 lib/api-client —— 那支讀的是 server-only 的 RAILWAY_API_URL
import { API_URL } from "@/lib/api-url"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Status = {
  pending: number
  already_sent: number
  sent_today: number
  daily_cap: number
  remaining_today: number
  coupon: { amount: number; min_order: number; valid_days: number }
  sample: Array<{ email: string; name: string }>
}

async function callApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await createClient().auth.getSession()).data.session?.access_token
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  return json as T
}

export function BroadcastClient() {
  const [status, setStatus] = useState<Status | null>(null)
  const [testEmail, setTestEmail] = useState("")
  const [batch, setBatch] = useState("50")
  const [resendList, setResendList] = useState("")
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  async function load() {
    setLoading(true)
    try {
      setStatus(await callApi<Status>("/admin/broadcast/membership-update"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "載入失敗")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function send(body: Record<string, unknown>, label: string) {
    startTransition(async () => {
      try {
        const r = await callApi<{
          sent: number
          failed: string[]
          remaining: number
          remaining_today: number
        }>(
          "/admin/broadcast/membership-update",
          { method: "POST", body: JSON.stringify({ ...body, confirm: true }) },
        )
        toast.success(`${label}：已寄出 ${r.sent} 封`, {
          description:
            (r.failed.length ? `${r.failed.length} 封失敗。` : "") +
            `還剩 ${r.remaining} 人未寄，今日還能寄 ${r.remaining_today} 封。`,
        })
        await load()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "寄送失敗")
      }
    })
  }

  if (loading) return <p className="text-sm text-zinc-500">載入中…</p>
  if (!status) return null

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-zinc-500">待寄送</p>
          <p className="text-2xl font-bold text-[#10305a]">{status.pending}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-zinc-500">已寄送</p>
          <p className="text-2xl font-bold text-[#10305a]">{status.already_sent}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-zinc-500">今日還能寄</p>
          <p className="text-2xl font-bold text-[#10305a]">{status.remaining_today}</p>
          <p className="text-xs text-zinc-500">
            已寄 {status.sent_today} / 上限 {status.daily_cap}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-zinc-500">隨信附的券</p>
          <p className="text-sm font-medium text-[#10305a]">
            滿 {status.coupon.min_order.toLocaleString()} 折 {status.coupon.amount}
          </p>
          <p className="text-xs text-zinc-500">{status.coupon.valid_days} 天有效</p>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-2 font-medium text-[#10305a]">1. 先測試寄給自己</p>
        <p className="mb-3 text-sm text-zinc-500">
          這個 email 必須在待寄名單上。寄出後他就算「已寄送」，不會再收到第二封。
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            className="max-w-xs"
          />
          <Button
            variant="outline"
            disabled={isPending || !testEmail.trim()}
            onClick={() => send({ only: [testEmail.trim().toLowerCase()] }, "測試寄送")}
          >
            測試寄送
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p className="mb-2 font-medium text-amber-900">2. 正式寄出（分批）</p>
        <p className="mb-3 text-sm text-amber-900">
          一次寄一批就好，寄件聲譽比較穩。按下去就寄，<strong>收不回來</strong>。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={500}
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            className="w-28"
          />
          <span className="text-sm text-amber-900">封</span>
          <Button
            disabled={isPending || status.pending === 0}
            onClick={() => {
              const n = Number(batch)
              if (!Number.isFinite(n) || n < 1) {
                toast.error("請填寫正確的數量")
                return
              }
              if (!confirm(`確定要寄出 ${Math.min(n, status.pending)} 封？寄出後無法收回。`)) return
              send({ limit: n }, "正式寄送")
            }}
          >
            寄出這一批
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-2 font-medium text-[#10305a]">3. 補寄（有券但沒收到信的人）</p>
        <p className="mb-3 text-sm text-zinc-500">
          寄送服務超過每日額度時會收下請求卻不投遞，造成「有券、沒收到信」。
          從寄送服務的後台找出沒送達的信箱，貼在這裡重寄——<strong>會沿用他原本那張券，不發第二張</strong>。
        </p>
        <textarea
          value={resendList}
          onChange={(e) => setResendList(e.target.value)}
          placeholder={"a@example.com\nb@example.com"}
          rows={4}
          className="mb-2 w-full rounded border px-3 py-2 text-sm"
        />
        <Button
          variant="outline"
          disabled={isPending || !resendList.trim()}
          onClick={() => {
            const emails = resendList
              .split(/[\s,;]+/)
              .map((x) => x.trim().toLowerCase())
              .filter((x) => x.includes("@"))
            if (emails.length === 0) {
              toast.error("請貼上要補寄的信箱")
              return
            }
            if (!confirm(`確定要補寄 ${emails.length} 封？`)) return
            send({ only: emails, resend: true }, "補寄")
          }}
        >
          補寄這些人
        </Button>
      </div>

      {status.sample.length > 0 && (
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium text-[#10305a]">待寄名單（前 10 筆）</p>
          <ul className="space-y-1 text-sm text-zinc-600">
            {status.sample.map((s) => (
              <li key={s.email}>
                {s.name || "（未填姓名）"} — {s.email}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
