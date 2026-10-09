"use client"

import { useState } from "react"
import { API_URL } from "@/lib/api-url"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * 分享回報表單。
 *
 * 會員看到的只有「貼連結或傳截圖」—— 分享類型與點數都由管理者事後判斷，
 * 所以這裡沒有任何分類選單。多一個下拉就是多一個讓人猶豫的地方，而且
 * 選錯還要管理者再改一次。
 */
const MAX_BYTES = 5 * 1024 * 1024

export function ShareReportForm({ memberEmail }: { memberEmail: string | null }) {
  const [link, setLink] = useState("")
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [website, setWebsite] = useState("") // honeypot
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [fileName, setFileName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function pickFile(file: File | undefined) {
    setError(null)
    if (!file) {
      setScreenshot(null)
      setFileName("")
      return
    }
    if (file.size > MAX_BYTES) {
      setError("截圖超過 5 MB，請改傳小一點的圖")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setScreenshot(typeof reader.result === "string" ? reader.result : null)
      setFileName(file.name)
    }
    reader.onerror = () => setError("截圖讀取失敗，請重新選擇一次")
    reader.readAsDataURL(file)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!link.trim() && !screenshot) {
      setError("請貼連結或上傳截圖")
      return
    }
    setSubmitting(true)
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const { data } = await createClient().auth.getSession()
      const token = data.session?.access_token
      const res = await fetch(`${API_URL}/share-reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ link, screenshot, message, email, website }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? "送出失敗，請再試一次")
        return
      }
      setDone(true)
    } catch {
      setError("送出失敗，請確認網路後再試一次")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-[#10305a]/15 bg-[#10305a]/5 p-6 text-center">
        <p className="text-lg font-semibold text-[#10305a]">收到了，謝謝你。</p>
        <p className="mt-2 text-sm text-[#687279]">我們看過會通知你。</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="link">分享連結</Label>
        <Input
          id="link"
          type="url"
          inputMode="url"
          placeholder="https://..."
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <p className="text-xs text-[#687279]">IG、Threads、Facebook、Dcard、PTT、部落格都可以。</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="screenshot">或上傳截圖</Label>
        <Input
          id="screenshot"
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <p className="text-xs text-[#687279]">
          一張就好。私人帳號、限時動態、純文字心得都適用。JPG／PNG／HEIC，5 MB 以內。
          {fileName ? `（已選擇：${fileName}）` : ""}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message">想跟我們說的話</Label>
        <Input
          id="message"
          placeholder="選填"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {!memberEmail && (
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            placeholder="用來對應你的會員資料"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}

      {/* honeypot：真人看不到，填了就是機器人。用 CSS 隱藏而不是 type=hidden，
          因為多數爬蟲只會跳過 hidden 欄位。 */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "送出中…" : "送出"}
      </Button>
    </form>
  )
}
