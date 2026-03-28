"use client"

import { useState, useEffect, useCallback, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Trash2, Plus, X } from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Campaign {
  id: string
  name: string
  description: string | null
  tier_id: string | null
  type: string
  config: Record<string, unknown> | null
  coupon_id: string | null
  is_active: boolean
  starts_at: string
  ends_at: string | null
  created_at: string
  coupon?: { code: string } | null
  tier?: { name: string } | null
}

interface MembershipTier {
  id: string
  name: string
}

type StatusKey = "all" | "active" | "scheduled" | "ended" | "disabled"

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "進行中" },
  { key: "scheduled", label: "排程中" },
  { key: "ended", label: "已結束" },
  { key: "disabled", label: "停用" },
]

const TYPE_LABEL: Record<string, string> = {
  discount: "折扣",
  freebie: "贈品",
  points_multiplier: "點數加倍",
  free_shipping: "免運",
  bundle: "組合優惠",
}

const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function campaignStatus(c: Campaign): {
  key: StatusKey
  label: string
  variant: "default" | "secondary" | "destructive" | "outline"
} {
  if (!c.is_active) return { key: "disabled", label: "停用", variant: "secondary" }
  const now = new Date()
  if (c.ends_at && new Date(c.ends_at) < now) return { key: "ended", label: "已結束", variant: "destructive" }
  if (new Date(c.starts_at) > now) return { key: "scheduled", label: "排程中", variant: "outline" }
  return { key: "active", label: "進行中", variant: "default" }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" })
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* ------------------------------------------------------------------ */
/*  Config fields per type                                             */
/* ------------------------------------------------------------------ */

function ConfigFields({ type, config, prefix }: { type: string; config: Record<string, unknown>; prefix: string }) {
  if (type === "discount") {
    return (
      <>
        <div className="space-y-1.5">
          <Label className="text-xs">折扣方式</Label>
          <select name={`${prefix}_discount_method`} defaultValue={(config.discount_method as string) ?? "percent"} className={selectClass}>
            <option value="percent">百分比</option>
            <option value="fixed">固定金額</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">折扣值</Label>
          <Input name={`${prefix}_discount_value`} type="number" min={0} defaultValue={(config.discount_value as number) ?? ""} placeholder="10" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">適用範圍</Label>
          <select name={`${prefix}_scope`} defaultValue={(config.scope as string) ?? "all"} className={selectClass}>
            <option value="all">全部商品</option>
            <option value="specific_categories">指定分類</option>
          </select>
        </div>
      </>
    )
  }

  if (type === "bundle") {
    return (
      <>
        <div className="space-y-1.5">
          <Label className="text-xs">購買數量</Label>
          <Input name={`${prefix}_buy_quantity`} type="number" min={1} defaultValue={(config.buy_quantity as number) ?? ""} placeholder="2" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">贈送數量</Label>
          <Input name={`${prefix}_free_quantity`} type="number" min={1} defaultValue={(config.free_quantity as number) ?? ""} placeholder="1" />
        </div>
      </>
    )
  }

  if (type === "free_shipping") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">最低訂單金額</Label>
        <Input name={`${prefix}_min_order_amount`} type="number" min={0} defaultValue={(config.min_order_amount as number) ?? ""} placeholder="500" />
      </div>
    )
  }

  // default: raw JSON textarea
  return (
    <div className="space-y-1.5 sm:col-span-2 md:col-span-3">
      <Label className="text-xs">設定 (JSON)</Label>
      <textarea
        name={`${prefix}_raw_config`}
        rows={3}
        defaultValue={Object.keys(config).length > 0 ? JSON.stringify(config, null, 2) : ""}
        placeholder='{"key": "value"}'
        className={`${selectClass} font-mono text-xs`}
      />
    </div>
  )
}

function extractConfig(fd: FormData, prefix: string, type: string): Record<string, unknown> {
  if (type === "discount") {
    return {
      discount_method: fd.get(`${prefix}_discount_method`) as string,
      discount_value: Number(fd.get(`${prefix}_discount_value`)) || 0,
      scope: fd.get(`${prefix}_scope`) as string,
    }
  }
  if (type === "bundle") {
    return {
      buy_quantity: Number(fd.get(`${prefix}_buy_quantity`)) || 1,
      free_quantity: Number(fd.get(`${prefix}_free_quantity`)) || 1,
    }
  }
  if (type === "free_shipping") {
    return { min_order_amount: Number(fd.get(`${prefix}_min_order_amount`)) || 0 }
  }
  try {
    return JSON.parse((fd.get(`${prefix}_raw_config`) as string) || "{}")
  } catch {
    return {}
  }
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [tiers, setTiers] = useState<MembershipTier[]>([])
  const [tab, setTab] = useState<StatusKey>("all")
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [createType, setCreateType] = useState("discount")
  const [editType, setEditType] = useState("discount")
  const [isPending, startTransition] = useTransition()

  /* --- Fetch --- */

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/campaigns`)
      if (res.ok) {
        const json = await res.json()
        setCampaigns(json.campaigns ?? json.data ?? json ?? [])
      }
    } catch { /* API unavailable */ }
  }, [])

  const fetchTiers = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/membership-tiers`)
      if (res.ok) {
        const json = await res.json()
        setTiers(json.data ?? json.tiers ?? json ?? [])
      }
    } catch { /* API unavailable */ }
  }, [])

  useEffect(() => {
    fetchCampaigns()
    fetchTiers()
  }, [fetchCampaigns, fetchTiers])

  const filtered = tab === "all" ? campaigns : campaigns.filter((c) => campaignStatus(c).key === tab)

  /* --- Create --- */

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const type = fd.get("type") as string
    const form = e.currentTarget

    startTransition(async () => {
      try {
        const res = await fetch(`${API_URL}/admin/campaigns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fd.get("name"),
            description: (fd.get("description") as string) || null,
            tier_id: (fd.get("tier_id") as string) || null,
            type,
            config: extractConfig(fd, "c", type),
            is_active: fd.get("is_active") === "on",
            starts_at: fd.get("starts_at"),
            ends_at: (fd.get("ends_at") as string) || null,
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "建立失敗")
        toast.success("活動已建立")
        form.reset()
        setShowCreate(false)
        setCreateType("discount")
        await fetchCampaigns()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "建立失敗")
      }
    })
  }

  /* --- Update --- */

  function handleUpdate(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const type = fd.get("type") as string

    startTransition(async () => {
      try {
        const res = await fetch(`${API_URL}/admin/campaigns/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fd.get("name"),
            description: (fd.get("description") as string) || null,
            tier_id: (fd.get("tier_id") as string) || null,
            type,
            config: extractConfig(fd, "e", type),
            is_active: fd.get("is_active") === "on",
            starts_at: fd.get("starts_at"),
            ends_at: (fd.get("ends_at") as string) || null,
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "更新失敗")
        toast.success("活動已更新")
        setEditingId(null)
        await fetchCampaigns()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "更新失敗")
      }
    })
  }

  /* --- Delete --- */

  function handleDelete(id: string, name: string) {
    if (!confirm(`確定要刪除活動「${name}」嗎？此操作無法還原。`)) return
    startTransition(async () => {
      try {
        const res = await fetch(`${API_URL}/admin/campaigns/${id}`, { method: "DELETE" })
        if (!res.ok) throw new Error("刪除失敗")
        toast.success("活動已刪除")
        await fetchCampaigns()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "刪除失敗")
      }
    })
  }

  /* --- Render --- */

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">行銷活動管理</h1>
      </div>

      {/* Create toggle / form */}
      {!showCreate ? (
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" />
          新增活動
        </Button>
      ) : (
        <form onSubmit={handleCreate} className="border rounded-lg bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">新增活動</h3>
            <button type="button" onClick={() => setShowCreate(false)} className="text-zinc-400 hover:text-zinc-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">活動名稱 *</Label>
              <Input name="name" required placeholder="夏季促銷" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">類型 *</Label>
              <select
                name="type"
                required
                value={createType}
                onChange={(e) => setCreateType(e.target.value)}
                className={selectClass}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">限定等級</Label>
              <select name="tier_id" className={selectClass}>
                <option value="">全部等級</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">開始時間 *</Label>
              <Input name="starts_at" type="datetime-local" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">結束時間（選填）</Label>
              <Input name="ends_at" type="datetime-local" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" defaultChecked className="rounded" />
                啟用
              </label>
            </div>
            <div className="sm:col-span-2 md:col-span-3 space-y-1.5">
              <Label className="text-xs">描述</Label>
              <textarea
                name="description"
                rows={2}
                placeholder="活動說明"
                className={selectClass}
              />
            </div>
            <ConfigFields type={createType} config={{}} prefix="c" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "建立中..." : "建立"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)} disabled={isPending}>取消</Button>
          </div>
        </form>
      )}

      {/* Stats */}
      {campaigns.length > 0 && (
        <div className="flex gap-4 text-sm text-zinc-500">
          <span>共 {campaigns.length} 項</span>
          <span>進行中 {campaigns.filter((c) => campaignStatus(c).key === "active").length}</span>
          <span>排程中 {campaigns.filter((c) => campaignStatus(c).key === "scheduled").length}</span>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 border-b">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-[#10305a] text-[#10305a]"
                : "border-transparent text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {label}
            {key !== "all" && (
              <span className="ml-1 text-xs">({campaigns.filter((c) => campaignStatus(c).key === key).length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs">
            <tr>
              <th className="px-4 py-3 text-left">活動名稱</th>
              <th className="px-4 py-3 text-left">類型</th>
              <th className="px-4 py-3 text-left">限定等級</th>
              <th className="px-4 py-3 text-center">狀態</th>
              <th className="px-4 py-3 text-left">活動期間</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                  暫無活動資料，點擊上方按鈕新增
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const status = campaignStatus(c)
                const isEditing = editingId === c.id

                if (isEditing) {
                  return (
                    <tr key={c.id}>
                      <td colSpan={6} className="p-4 bg-zinc-50">
                        <form onSubmit={(e) => handleUpdate(c.id, e)} className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">編輯活動</h3>
                            <button type="button" onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-600">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs">活動名稱 *</Label>
                              <Input name="name" required defaultValue={c.name} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">類型 *</Label>
                              <select
                                name="type"
                                required
                                value={editType}
                                onChange={(e) => setEditType(e.target.value)}
                                className={selectClass}
                              >
                                {TYPE_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">限定等級</Label>
                              <select name="tier_id" defaultValue={c.tier_id ?? ""} className={selectClass}>
                                <option value="">全部等級</option>
                                {tiers.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">開始時間 *</Label>
                              <Input name="starts_at" type="datetime-local" required defaultValue={toLocalDatetime(c.starts_at)} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">結束時間（選填）</Label>
                              <Input name="ends_at" type="datetime-local" defaultValue={toLocalDatetime(c.ends_at)} />
                            </div>
                            <div className="flex items-end pb-1">
                              <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" name="is_active" defaultChecked={c.is_active} className="rounded" />
                                啟用
                              </label>
                            </div>
                            <div className="sm:col-span-2 md:col-span-3 space-y-1.5">
                              <Label className="text-xs">描述</Label>
                              <textarea
                                name="description"
                                rows={2}
                                defaultValue={c.description ?? ""}
                                className={selectClass}
                              />
                            </div>
                            <ConfigFields type={editType} config={(c.config as Record<string, unknown>) ?? {}} prefix="e" />
                          </div>
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "儲存中..." : "儲存"}</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={isPending}>取消</Button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={c.id}
                    className="hover:bg-zinc-50 cursor-pointer"
                    onClick={() => { setEditingId(c.id); setEditType(c.type) }}
                  >
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{TYPE_LABEL[c.type] ?? c.type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.tier?.name ? (
                        <Badge variant="outline">{c.tier.name}</Badge>
                      ) : (
                        <span className="text-zinc-400">全部等級</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {fmtDate(c.starts_at)} ~ {fmtDate(c.ends_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name) }}
                        className="p-1.5 rounded hover:bg-red-50 text-zinc-500 hover:text-red-600"
                        title="刪除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
