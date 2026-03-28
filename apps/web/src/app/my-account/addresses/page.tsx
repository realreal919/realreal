"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, X } from "lucide-react"

type Address = {
  id: string
  name: string
  phone: string
  city: string
  district: string
  postal_code: string
  address_line: string
  is_default: boolean
}

const STORAGE_KEY = "realreal_addresses"

function generateId() {
  return `addr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function loadAddresses(): Address[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAddresses(addresses: Address[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses))
}

const emptyForm: Omit<Address, "id"> = {
  name: "",
  phone: "",
  city: "",
  district: "",
  postal_code: "",
  address_line: "",
  is_default: false,
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Address, "id">>(emptyForm)

  useEffect(() => {
    setAddresses(loadAddresses())
  }, [])

  function openAddForm() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEditForm(addr: Address) {
    setEditingId(addr.id)
    setForm({
      name: addr.name,
      phone: addr.phone,
      city: addr.city,
      district: addr.district,
      postal_code: addr.postal_code,
      address_line: addr.address_line,
      is_default: addr.is_default,
    })
    setShowForm(true)
  }

  function handleSubmit() {
    if (!form.name || !form.phone || !form.address_line) {
      toast.error("請填寫必要欄位（姓名、電話、地址）")
      return
    }

    let updated: Address[]
    if (editingId) {
      updated = addresses.map((a) =>
        a.id === editingId ? { ...form, id: editingId } : a
      )
    } else {
      const newAddr: Address = { ...form, id: generateId() }
      updated = [...addresses, newAddr]
    }

    // If this address is set as default, unset others
    if (form.is_default) {
      const targetId = editingId ?? updated[updated.length - 1].id
      updated = updated.map((a) => ({
        ...a,
        is_default: a.id === targetId,
      }))
    }

    saveAddresses(updated)
    setAddresses(updated)
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    toast.success(editingId ? "地址已更新" : "地址已新增")
  }

  function handleDelete(id: string) {
    const updated = addresses.filter((a) => a.id !== id)
    saveAddresses(updated)
    setAddresses(updated)
    toast.success("地址已刪除")
  }

  function updateField(key: keyof Omit<Address, "id">, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#10305a]">收件地址</h1>
        {!showForm && (
          <Button onClick={openAddForm} size="sm" className="bg-[#10305a] hover:bg-[#10305a]/90">
            <Plus className="w-4 h-4 mr-1" />
            新增地址
          </Button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg text-[#10305a]">
              {editingId ? "編輯地址" : "新增地址"}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="addr-name">收件人姓名 *</Label>
                <Input
                  id="addr-name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="王小明"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr-phone">聯絡電話 *</Label>
                <Input
                  id="addr-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="0912-345-678"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="addr-postal">郵遞區號</Label>
                <Input
                  id="addr-postal"
                  value={form.postal_code}
                  onChange={(e) => updateField("postal_code", e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr-city">縣市</Label>
                <Input
                  id="addr-city"
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="台北市"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr-district">區域</Label>
                <Input
                  id="addr-district"
                  value={form.district}
                  onChange={(e) => updateField("district", e.target.value)}
                  placeholder="中正區"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="addr-line">詳細地址 *</Label>
              <Input
                id="addr-line"
                value={form.address_line}
                onChange={(e) => updateField("address_line", e.target.value)}
                placeholder="忠孝東路一段1號"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="addr-default"
                checked={form.is_default}
                onChange={(e) => updateField("is_default", e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <Label htmlFor="addr-default" className="font-normal">
                設為預設地址
              </Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} className="bg-[#10305a] hover:bg-[#10305a]/90">
                {editingId ? "更新地址" : "新增地址"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                }}
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Address List */}
      {addresses.length === 0 && !showForm ? (
        <div className="text-center py-16">
          <p className="text-zinc-500 mb-4">尚未新增收件地址</p>
          <Button onClick={openAddForm} variant="outline">
            <Plus className="w-4 h-4 mr-1" />
            新增第一筆地址
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <Card key={addr.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{addr.name}</p>
                      {addr.is_default && (
                        <span className="text-xs bg-[#10305a]/10 text-[#10305a] px-2 py-0.5 rounded-full">
                          預設
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{addr.phone}</p>
                    <p className="text-sm text-zinc-600">
                      {addr.postal_code && `${addr.postal_code} `}
                      {addr.city}
                      {addr.district}
                      {addr.address_line}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditForm(addr)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(addr.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
