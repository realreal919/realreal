"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createCouponAction } from "./actions"

export function CreateCouponForm() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    startTransition(async () => {
      await createCouponAction({
        code: fd.get("code") as string,
        type: fd.get("type") as string,
        value: Number(fd.get("value")),
        max_uses: fd.get("max_uses") ? Number(fd.get("max_uses")) : null,
        expires_at: (fd.get("expires_at") as string) || null,
      })
      form.reset()
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        新增折扣碼
      </Button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border rounded-lg bg-white p-4 space-y-4"
    >
      <h3 className="text-sm font-semibold">新增折扣碼</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="code" className="text-xs">折扣碼</Label>
          <Input id="code" name="code" placeholder="例如 SUMMER2026" required className="uppercase" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="type" className="text-xs">類型</Label>
          <select
            id="type"
            name="type"
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="percentage">百分比折扣</option>
            <option value="fixed">固定折扣</option>
            <option value="free_shipping">免運費</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="value" className="text-xs">折扣值</Label>
          <Input id="value" name="value" type="number" min={0} placeholder="10" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="max_uses" className="text-xs">使用上限（空白=無限）</Label>
          <Input id="max_uses" name="max_uses" type="number" min={1} placeholder="不限" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expires_at" className="text-xs">到期日</Label>
          <Input id="expires_at" name="expires_at" type="date" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "建立中…" : "建立"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
          取消
        </Button>
      </div>
    </form>
  )
}
