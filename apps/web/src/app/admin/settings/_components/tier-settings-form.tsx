"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Tier {
  id: string
  name: string
  min_spend: number
  discount_rate: number
}

export default function TierSettingsForm({ tiers }: { tiers: Tier[] }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState<Record<string, { minSpend: number; discountRate: number }>>(
    Object.fromEntries(
      tiers.map((t) => [t.id, { minSpend: t.min_spend, discountRate: t.discount_rate }])
    )
  )

  async function handleSave(tierId: string) {
    setSaving(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
      await fetch(`${API_URL}/admin/settings/tiers/${tierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          minSpend: values[tierId]?.minSpend,
          discountRate: values[tierId]?.discountRate,
        }),
      })
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {tiers.map((tier) => (
        <div key={tier.id} className="flex items-center gap-4 py-2 border-b border-zinc-100 last:border-0">
          <div className="w-24 font-medium text-sm">{tier.name}</div>
          {editingId === tier.id ? (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-zinc-500">最低消費</Label>
                <Input
                  type="number"
                  className="w-24 h-7 text-sm"
                  value={values[tier.id]?.minSpend ?? 0}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [tier.id]: { ...v[tier.id], minSpend: Number(e.target.value) },
                    }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-zinc-500">折扣率</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  className="w-20 h-7 text-sm"
                  value={values[tier.id]?.discountRate ?? 0}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [tier.id]: { ...v[tier.id], discountRate: Number(e.target.value) },
                    }))
                  }
                />
              </div>
              <Button size="sm" disabled={saving} onClick={() => handleSave(tier.id)}>
                {saving ? "儲存中..." : "儲存"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                取消
              </Button>
            </>
          ) : (
            <>
              <span className="text-sm text-zinc-500">
                最低消費 NT$ {(values[tier.id]?.minSpend ?? 0).toLocaleString()}
              </span>
              <span className="text-sm text-zinc-500">
                折扣 {((values[tier.id]?.discountRate ?? 0) * 100).toFixed(0)}%
              </span>
              <Button size="sm" variant="outline" onClick={() => setEditingId(tier.id)}>
                編輯
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
