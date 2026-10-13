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
  coupons: Array<{ amount: number; min_order: number }>
  coupon_valid_days: number
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

/** 10/9 那批不寄更正信的人（店主指定：自己的測試帳號與重複帳號）。 */
const DEFAULT_CORRECTION_EXCLUDE = [
  "yinhsin.c@gmail.com",
  "chinchang9083@gmail.com",
  "karso11188@gmail.com",
  "karso1122@yahoo.com.tw",
].join("\n")

type DelayPreview = {
  targets: Array<{ order_number: string; name: string; email: string }>
  missing: string[]
  sent_today: number
  daily_cap: number
}

type Correction = {
  pending: number
  already_sent: number
  excluded: number
  remaining_today: number
  daily_cap: number
  sent_today: number
}

/**
 * 出貨延後通知。
 *
 * 訂單編號由人填，不是系統推算 —— 缺哪個品項、哪幾張單受影響，只有看著庫存
 * 和訂單的人知道。按「查名單」會先把收件人列出來確認，再按寄出。
 */
function OrderDelaySection() {
  const [orders, setOrders] = useState("")
  const [shipDate, setShipDate] = useState("")
  const [preview, setPreview] = useState<DelayPreview | null>(null)
  const [isPending, startTransition] = useTransition()

  function lookup() {
    startTransition(async () => {
      try {
        const r = await callApi<DelayPreview>(
          `/admin/broadcast/order-delay?orders=${encodeURIComponent(orders)}`,
        )
        setPreview(r)
        if (r.missing.length > 0) {
          toast.warning(`這些訂單找不到收件信箱：${r.missing.join("、")}`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "查詢失敗")
      }
    })
  }

  function send() {
    if (!preview || preview.targets.length === 0) return
    if (!shipDate.trim()) {
      toast.error("請先填出貨日期")
      return
    }
    if (
      !confirm(
        `確定要寄出 ${preview.targets.length} 封出貨延後通知？\n` +
          `出貨日期會印成「${shipDate}」。寄出後無法收回。`,
      )
    ) {
      return
    }
    startTransition(async () => {
      try {
        const r = await callApi<{ sent: number; failed: string[]; missing: string[] }>(
          "/admin/broadcast/order-delay",
          {
            method: "POST",
            body: JSON.stringify({
              orderNumbers: preview.targets.map((t) => t.order_number),
              shipDate: shipDate.trim(),
              confirm: true,
            }),
          },
        )
        toast.success(`已寄出 ${r.sent} 封`, {
          description: r.failed.length ? `失敗：${r.failed.join("、")}` : undefined,
        })
        setPreview(null)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "寄送失敗")
      }
    })
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-1 text-base font-semibold text-[#10305a]">出貨延後通知</h2>
      <p className="mb-3 text-sm text-zinc-600">
        告訴客人他的訂單因缺貨會晚出貨。這是服務信，退訂行銷訊息的客人一樣會收到。
      </p>

      <label className="mb-1 block text-sm text-zinc-600">
        訂單編號（用空白、逗號或換行分隔）
      </label>
      <textarea
        className="mb-3 h-20 w-full rounded-md border px-3 py-2 text-sm"
        placeholder="10000327 10000331 10000335"
        value={orders}
        onChange={(e) => setOrders(e.target.value)}
      />

      <label className="mb-1 block text-sm text-zinc-600">
        出貨日期（照這樣印在信上，星期幾請自己寫）
      </label>
      <Input
        className="mb-3"
        placeholder="10/15（四）"
        value={shipDate}
        onChange={(e) => setShipDate(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={lookup} disabled={isPending || !orders.trim()}>
          查名單
        </Button>
        <Button
          onClick={send}
          disabled={isPending || !preview || preview.targets.length === 0}
          style={{ backgroundColor: "#10305a", color: "#fff" }}
        >
          寄出{preview && preview.targets.length > 0 ? ` ${preview.targets.length} 封` : ""}
        </Button>
      </div>

      {preview && (
        <div className="mt-3 rounded-md bg-zinc-50 p-3 text-sm">
          <p className="mb-2 text-zinc-600">
            今日已寄 {preview.sent_today} 封 ・ 上限 {preview.daily_cap} 封
          </p>
          {preview.targets.length === 0 ? (
            <p className="text-zinc-500">沒有可寄的對象</p>
          ) : (
            <ul className="space-y-1 text-zinc-700">
              {preview.targets.map((t) => (
                <li key={t.order_number}>
                  {t.order_number} ・ {t.name || "（未填姓名）"} — {t.email}
                </li>
              ))}
            </ul>
          )}
          {preview.missing.length > 0 && (
            <p className="mt-2 text-red-600">找不到收件信箱：{preview.missing.join("、")}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function BroadcastClient() {
  const [status, setStatus] = useState<Status | null>(null)
  const [testEmail, setTestEmail] = useState("")
  const [batch, setBatch] = useState("50")
  const [resendList, setResendList] = useState("")
  const [correction, setCorrection] = useState<Correction | null>(null)
  const [excludeList, setExcludeList] = useState(DEFAULT_CORRECTION_EXCLUDE)
  const [corrBatch, setCorrBatch] = useState("60")
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  const excludeParam = () =>
    excludeList
      .split(/[\s,;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.includes("@"))

  async function load() {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([
        callApi<Status>("/admin/broadcast/membership-update"),
        callApi<Correction>(
          `/admin/broadcast/correction?exclude=${encodeURIComponent(excludeParam().join(","))}`,
        ).catch(() => null),
      ])
      setCorrection(c)
      setStatus(s)
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

  function sendCorrection(limit: number) {
    startTransition(async () => {
      try {
        const r = await callApi<{
          sent: number
          failed: string[]
          remaining: number
          remaining_today: number
        }>("/admin/broadcast/correction", {
          method: "POST",
          body: JSON.stringify({ limit, exclude: excludeParam(), confirm: true }),
        })
        toast.success(`更正信：已寄出 ${r.sent} 封`, {
          description:
            (r.failed.length ? `${r.failed.length} 封失敗。` : "") +
            `還剩 ${r.remaining} 人，今日還能寄 ${r.remaining_today} 封。`,
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
      {/* 寄完就收起來。這是一次性的補救信，寄完之後留在畫面上只會讓人每次都要
          重新判斷「這個還要不要按」。已寄的筆數留一行當紀錄就夠了。 */}
      {correction && correction.already_sent > 0 && correction.pending === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-zinc-500">
          更正信已全部寄出（{correction.already_sent} 人，排除 {correction.excluded} 人），不需要再操作。
        </p>
      )}

      {correction && correction.pending > 0 && (
        <div className="rounded-lg border-2 border-[#10305a] p-4">
          <p className="mb-1 font-semibold text-[#10305a]">
            更正信（10/9 那批的推薦金額誤植為 0 元）
          </p>
          <p className="mb-3 text-sm text-zinc-500">
            待寄 <strong>{correction.pending}</strong> 人 ・ 已寄 {correction.already_sent} 人 ・
            排除 {correction.excluded} 人 ・ 今日還能寄 {correction.remaining_today} 封
          </p>
          <p className="mb-1 text-xs text-zinc-500">不寄給這些信箱（一行一個）</p>
          <textarea
            value={excludeList}
            onChange={(e) => setExcludeList(e.target.value)}
            rows={4}
            className="mb-2 w-full rounded border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              重算名單
            </Button>
            <Input
              type="number"
              min={1}
              max={500}
              value={corrBatch}
              onChange={(e) => setCorrBatch(e.target.value)}
              className="w-24"
            />
            <span className="text-sm">封</span>
            <Button
              disabled={isPending || correction.pending === 0}
              onClick={() => {
                const n = Number(corrBatch)
                if (!Number.isFinite(n) || n < 1) {
                  toast.error("請填寫正確的數量")
                  return
                }
                const willSend = Math.min(n, correction.pending, correction.remaining_today)
                if (!confirm(`確定要寄出 ${willSend} 封更正信？寄出後無法收回。`)) return
                sendCorrection(n)
              }}
            >
              寄出更正信
            </Button>
          </div>
        </div>
      )}

      {/* 會員制度更新通知。頁面標題改成「寄信給客人」之後，這一區需要自己的
          標題 —— 不然畫面上三種信混在一起，看不出哪些按鈕屬於哪一封。 */}
      <div>
        <h2 className="text-base font-semibold text-[#10305a]">會員制度更新通知（一次性）</h2>
        <p className="mt-1 text-sm text-zinc-500">
          寄給所有沒退訂行銷的會員，隨信發老朋友感謝券。先用「測試寄給自己」看過實際長相，再分批正式寄出。
        </p>
      </div>

      {/* 全部寄完就把統計與寄送控制收起來。這是一次性的廣播，寄完之後那些
          輸入框和按鈕留在畫面上，每次打開都要重新判斷一次「還要不要按」。 */}
      {status.pending === 0 && status.already_sent > 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-zinc-500">
          會員制度更新通知已全部寄出（{status.already_sent} 人），不需要再操作。
          新註冊的會員之後若要補寄，這一區會自動出現。
        </p>
      )}

      {status.pending > 0 && (<>
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
          {status.coupons.map((c) => (
            <p key={c.amount} className="text-sm font-medium text-[#10305a]">
              滿 {c.min_order.toLocaleString()} 折 {c.amount}
            </p>
          ))}
          <p className="text-xs text-zinc-500">{status.coupon_valid_days} 天有效</p>
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
      </>)}

      {/* 沒有人拿過券時沒有補寄的對象，整塊不顯示。 */}
      {status.already_sent > 0 && (
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
      )}

      <OrderDelaySection />

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
