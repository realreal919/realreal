"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { apiClient } from "@/lib/api-client"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type TypeOption = { value: string; label: string; points: number }

type Report = {
  id: string
  email: string | null
  display_name: string | null
  is_member: boolean
  link: string | null
  screenshot_url: string | null
  message: string | null
  is_duplicate: boolean
  status: string
  created_at: string
  monthly_counts: Record<string, number>
  upgrade: { points: number; typeCount: number; eligible: boolean } | null
}

const MONTHLY_CAP = 2

export function ShareReportsClient() {
  const [types, setTypes] = useState<TypeOption[]>([])
  const [rows, setRows] = useState<Report[]>([])
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<"pending" | "all">("pending")
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  async function load(next: "pending" | "all" = filter) {
    setLoading(true)
    try {
      const token = (await createClient().auth.getSession()).data.session?.access_token
      const json = await apiClient<{ types: TypeOption[]; data: Report[] }>(
        `/admin/share-reports?status=${next}`,
        { token },
      )
      setTypes(json.types)
      setRows(json.data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "載入失敗")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load("pending")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function decide(row: Report, action: "count" | "reject") {
    const type = picked[row.id]
    if (action === "count" && !type) {
      toast.error("請先選擇分享類型")
      return
    }
    startTransition(async () => {
      try {
        const token = (await createClient().auth.getSession()).data.session?.access_token
        const res = await apiClient<{ points?: number; upgrade?: { eligible: boolean } }>(
          `/admin/share-reports/${row.id}`,
          { method: "PATCH", body: JSON.stringify({ action, type }), token },
        )
        if (action === "reject") {
          toast.success("已標記為不計")
        } else {
          toast.success(`已記 ${res.points} 點`, {
            description: res.upgrade?.eligible
              ? "這位會員已達知心之友的條件，可以邀請升等了"
              : undefined,
          })
        }
        await load()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "處理失敗")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["pending", "all"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => {
              setFilter(f)
              void load(f)
            }}
          >
            {f === "pending" ? "待處理" : "全部"}
          </Button>
        ))}
        <span className="text-sm text-zinc-500">{loading ? "載入中…" : `${rows.length} 筆`}</span>
      </div>

      {!loading && rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-zinc-500">
          目前沒有待處理的分享回報。
        </p>
      )}

      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-[#10305a]">
                {r.display_name ?? r.email ?? "（無）"}
              </span>
              {r.email && <span className="text-zinc-500">{r.email}</span>}
              {!r.is_member && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                  非會員 — 無法記點
                </span>
              )}
              {r.is_duplicate && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                  連結重複
                </span>
              )}
              {r.upgrade?.eligible && (
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-900">
                  已達知心條件
                </span>
              )}
              <span className="ml-auto text-xs text-zinc-400">
                {new Date(r.created_at).toLocaleString("zh-TW")}
              </span>
            </div>

            {r.link && (
              <p className="mb-2 break-all text-sm">
                <a
                  href={r.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[#10305a] underline underline-offset-2"
                >
                  {r.link}
                </a>
              </p>
            )}
            {r.screenshot_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={r.screenshot_url} target="_blank" rel="noreferrer noopener">
                <img
                  src={r.screenshot_url}
                  alt="分享截圖"
                  className="mb-2 max-h-56 rounded border object-contain"
                />
              </a>
            )}
            {r.message && <p className="mb-3 text-sm text-zinc-600">「{r.message}」</p>}

            {r.status === "pending" ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded border px-2 py-1.5 text-sm"
                  value={picked[r.id] ?? ""}
                  onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))}
                >
                  <option value="">選擇類型…</option>
                  {types.map((t) => {
                    const used = r.monthly_counts?.[t.value] ?? 0
                    const full = used >= MONTHLY_CAP
                    return (
                      <option key={t.value} value={t.value} disabled={full}>
                        {t.label}（{t.points} 點）
                        {used > 0 ? ` — 本月已記 ${used} 次${full ? "，已達上限" : ""}` : ""}
                      </option>
                    )
                  })}
                </select>
                <Button size="sm" disabled={isPending || !r.is_member} onClick={() => decide(r, "count")}>
                  記點
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => decide(r, "reject")}
                >
                  不計
                </Button>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                {r.status === "counted" ? "已記點" : "不計"}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
