"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  describeAttribute,
  mergeAttributes,
  splitAttributes,
  type AttributeRow as Row,
} from "@/lib/variant-attributes"

type AttributesEditorProps = {
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}

function rowsEqual(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false
  return a.every((r, i) => r.key === b[i].key && r.value === b[i].value)
}

function AttributesEditor({ value, onChange }: AttributesEditorProps) {
  // Internal state preserves insertion order and allows empty-key rows
  // while user is typing. We seed from `value` once, and only re-seed when
  // an externally-provided value diverges from what our rows would produce
  // (so a parent reset still works, but our own onChange round-trip doesn't
  // wipe in-progress empty rows).
  //
  // 非字串的屬性（混搭組合的 recipe）不進表格 —— 進了會被 <Input> 轉成
  // "[object Object]"，一存檔配方就沒了。它們放在 preserved，唯讀顯示，
  // 送出時原樣帶回。詳見 lib/variant-attributes.ts。
  const split = React.useMemo(() => splitAttributes(value), [value])
  const [rows, setRows] = React.useState<Row[]>(() => split.editable)
  const lastEmittedRef = React.useRef<Row[]>(split.editable)

  React.useEffect(() => {
    if (!rowsEqual(split.editable, lastEmittedRef.current)) {
      setRows(split.editable)
      lastEmittedRef.current = split.editable
    }
  }, [split])

  const commit = React.useCallback(
    (nextRows: Row[]) => {
      setRows(nextRows)
      if (!rowsEqual(nextRows, lastEmittedRef.current)) {
        lastEmittedRef.current = nextRows
        onChange(mergeAttributes(nextRows, split.preserved))
      }
    },
    [onChange, split.preserved],
  )

  const handleKeyChange = (index: number, key: string) => {
    const next = rows.slice()
    next[index] = { ...next[index], key }
    commit(next)
  }

  const handleValueChange = (index: number, val: string) => {
    const next = rows.slice()
    next[index] = { ...next[index], value: val }
    commit(next)
  }

  const handleDelete = (index: number) => {
    const next = rows.slice()
    next.splice(index, 1)
    commit(next)
  }

  const handleAdd = () => {
    commit([...rows, { key: "", value: "" }])
  }

  const preservedEntries = Object.entries(split.preserved)

  return (
    <div className="mt-2 rounded-[10px] bg-gray-50 p-3">
      {rows.length === 0 && preservedEntries.length === 0 ? (
        <p className="mb-2 text-xs text-gray-400">尚無屬性</p>
      ) : null}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                className="h-9 flex-1 text-sm"
                placeholder="屬性名稱（例：口味）"
                value={row.key}
                onChange={(e) => handleKeyChange(index, e.target.value)}
              />
              <Input
                className="h-9 flex-1 text-sm"
                placeholder="屬性值（例：芝麻）"
                value={row.value}
                onChange={(e) => handleValueChange(index, e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(index)}
                aria-label="刪除屬性"
                className="h-9 px-2 text-gray-500 hover:text-red-600"
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}

      {preservedEntries.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="mb-1 text-xs font-semibold text-amber-900">
            以下屬性不能在這裡編輯，儲存時會原樣保留
          </p>
          <ul className="space-y-0.5 text-xs text-amber-800">
            {preservedEntries.map(([k, v]) => (
              <li key={k}>
                <span className="font-mono">{k}</span>：{describeAttribute(v)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="mt-3"
      >
        + 新增屬性
      </Button>
    </div>
  )
}

export default AttributesEditor
