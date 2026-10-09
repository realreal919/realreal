"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
// 瀏覽器端元件不能用 lib/api-client —— 那支讀的是 server-only 的 RAILWAY_API_URL
import { API_URL } from "@/lib/api-url"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type Bucket = "reminder" | "long_time_no_see"

type Candidate = {
  user_id: string
  email: string | null
  display_name: string | null
  first_order_number: string
  first_order_at: string
  days_since: number
  bucket: Bucket
}

type Payload = {
  labels: Record<Bucket, string>
  counts: Record<Bucket, number>
  data: Candidate[]
}

async function token() {
  return (await createClient().auth.getSession()).data.session?.access_token
}

async function callApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token()
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  return json as T
}

export function RecallClient() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  async function load() {
    setLoading(true)
    try {
      const json = await callApi<Payload>("/admin/recall-list")
      setPayload(json)
      setPicked({})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "載入失敗")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // CSV 走 fetch 再轉 blob，不能直接開新視窗 —— 這支要帶 Authorization 標頭
  async function download() {
    try {
      const t = await token()
      const res = await fetch(`${API_URL}/admin/recall-list?format=csv`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = `recall-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "下載失敗")
    }
  }

  function mark() {
    const ids = Object.keys(picked).filter((k) => picked[k])
    if (ids.length === 0) {
      toast.error("請先勾選已經寄出的人")
      return
    }
    startTransition(async () => {
      try {
        const res = await callApi<{ marked: number; skipped: string[] }>(
          "/admin/recall-list/mark",
          { method: "POST", body: JSON.stringify({ user_ids: ids }) },
        )
        toast.success(`已標記 ${res.marked} 人`, {
          description: res.skipped.length > 0 ? `${res.skipped.length} 人未標記` : undefined,
        })
        await load()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "標記失敗")
      }
    })
  }

  const rows = payload?.data ?? []
  const selected = Object.values(picked).filter(Boolean).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          重新整理
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void download()}
          disabled={rows.length === 0}
        >
          下載 CSV
        </Button>
        <Button size="sm" onClick={mark} disabled={isPending || selected === 0}>
          標記為已寄出（{selected}）
        </Button>
        <span className="text-sm text-zinc-500">
          {loading
            ? "載入中…"
            : payload
              ? `共 ${rows.length} 人：${payload.labels.reminder} ${payload.counts.reminder} 人、${payload.labels.long_time_no_see} ${payload.counts.long_time_no_see} 人`
              : ""}
        </span>
      </div>

      {!loading && rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-zinc-500">
          目前沒有需要召回的會員。
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="全選"
                    checked={selected === rows.length}
                    onChange={(e) =>
                      setPicked(
                        e.target.checked
                          ? Object.fromEntries(rows.map((r) => [r.user_id, true]))
                          : {},
                      )
                    }
                  />
                </th>
                <th className="px-3 py-2">會員</th>
                <th className="px-3 py-2">首購</th>
                <th className="px-3 py-2">距今</th>
                <th className="px-3 py-2">建議名單</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`選擇 ${r.email ?? r.user_id}`}
                      checked={!!picked[r.user_id]}
                      onChange={(e) =>
                        setPicked((p) => ({ ...p, [r.user_id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-[#10305a]">
                      {r.display_name ?? "（未填）"}
                    </span>
                    <span className="ml-2 text-zinc-500">{r.email}</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {r.first_order_number}
                    <span className="ml-2 text-xs text-zinc-400">
                      {r.first_order_at.slice(0, 10)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.days_since} 天</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.bucket === "reminder"
                          ? "rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-900"
                          : "rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
                      }
                    >
                      {payload?.labels[r.bucket]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
