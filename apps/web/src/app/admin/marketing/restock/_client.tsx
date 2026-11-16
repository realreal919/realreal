"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
// 瀏覽器端元件不能用 lib/api-client —— 那支讀的是 server-only 的 RAILWAY_API_URL
import { API_URL } from "@/lib/api-url"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type Group = {
  productId: string
  name: string
  slug: string
  count: number
  waiting: Array<{ email: string; created_at: string }>
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

function fmt(iso: string): string {
  return iso.slice(0, 10)
}

export function RestockClient() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true)
    try {
      const json = await callApi<{ data: Group[] }>("/admin/restock")
      setGroups(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "載入失敗")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function notify(g: Group) {
    // 寄信是寄出去就收不回來的動作，而且一次寄給所有人。按鈕不該是「手滑就送出」。
    const ok = window.confirm(
      `確定要寄出到貨通知嗎？\n\n商品：${g.name}\n收件人：${g.count} 位\n\n寄出後這些人就會從名單移除，無法取消。`,
    )
    if (!ok) return

    setSending(g.productId)
    try {
      const r = await callApi<{ sent: number; failed: number; failedEmails?: string[] }>(
        `/admin/restock/${g.productId}/notify`,
        { method: "POST" },
      )
      if (r.failed > 0) {
        toast.warning(
          `寄出 ${r.sent} 封，有 ${r.failed} 封失敗：${(r.failedEmails ?? []).join("、")}。失敗的仍留在名單上，可以再按一次。`,
        )
      } else {
        toast.success(`已寄出 ${r.sent} 封到貨通知`)
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "寄送失敗")
    } finally {
      setSending(null)
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">載入中…</p>

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
        目前沒有人在等到貨通知。
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.productId} className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-[#10305a]">{g.name}</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                {g.count} 位在等
                {g.slug && (
                  <>
                    {" ・ "}
                    <a
                      href={`/shop/${g.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-[#10305a]"
                    >
                      看商品頁
                    </a>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen((o) => ({ ...o, [g.productId]: !o[g.productId] }))}
              >
                {open[g.productId] ? "收起名單" : "看名單"}
              </Button>
              <Button
                size="sm"
                onClick={() => void notify(g)}
                disabled={sending === g.productId}
              >
                {sending === g.productId ? "寄送中…" : "通知他們"}
              </Button>
            </div>
          </div>

          {open[g.productId] && (
            <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
              {g.waiting.map((w) => (
                <li key={`${w.email}-${w.created_at}`} className="flex justify-between gap-4">
                  <span className="truncate">{w.email}</span>
                  <span className="shrink-0 text-zinc-400">{fmt(w.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
