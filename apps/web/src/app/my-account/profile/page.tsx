"use client"

import { useEffect, useState, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

type Profile = {
  display_name: string
  phone: string
  birthday: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    display_name: "",
    phone: "",
    birthday: "",
  })
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("user_profiles")
        .select("display_name, phone, birthday")
        .eq("user_id", user.id)
        .single()

      if (data) {
        setProfile({
          display_name: data.display_name ?? "",
          phone: data.phone ?? "",
          birthday: data.birthday ?? "",
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  function handleSave() {
    startTransition(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast.error("請先登入")
        return
      }

      const { error } = await supabase
        .from("user_profiles")
        .update({
          display_name: profile.display_name || null,
          phone: profile.phone || null,
          birthday: profile.birthday || null,
        })
        .eq("user_id", user.id)

      if (error) {
        toast.error("儲存失敗，請稍後再試")
      } else {
        toast.success("個人資料已更新")
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">個人資料</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本資訊</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="display_name">顯示名稱</Label>
            <Input
              id="display_name"
              value={profile.display_name}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  display_name: e.target.value,
                }))
              }
              placeholder="請輸入您的名稱"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">手機號碼</Label>
            <Input
              id="phone"
              type="tel"
              value={profile.phone}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="0912-345-678"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="birthday">生日</Label>
            <Input
              id="birthday"
              type="date"
              value={profile.birthday}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, birthday: e.target.value }))
              }
            />
          </div>

          <div className="pt-2">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              儲存變更
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
