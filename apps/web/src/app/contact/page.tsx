"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

export default function ContactPage() {
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSending(true)

    const fd = new FormData(e.currentTarget)
    const body = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      subject: fd.get("subject"),
      message: fd.get("message"),
    }

    try {
      const res = await fetch(`${API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error("送出失敗")
      toast.success("訊息已送出，我們會盡快回覆您！")
      e.currentTarget.reset()
    } catch {
      toast.error("送出失敗，請稍後再試")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2 text-center text-[#10305a]">聯絡我們</h1>
      <p className="text-[#687279] text-center mb-10">
        有任何問題或合作提案，歡迎與我們聯繫
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        {/* Contact Form */}
        <form onSubmit={handleSubmit} className="md:col-span-2 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">姓名 *</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="您的姓名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">電子信箱 *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">聯絡電話</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="09xx-xxx-xxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">主旨 *</Label>
              <Input
                id="subject"
                name="subject"
                required
                placeholder="詢問主旨"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">訊息內容 *</Label>
            <Textarea
              id="message"
              name="message"
              required
              rows={6}
              placeholder="請輸入您想詢問的內容…"
            />
          </div>

          <Button type="submit" className="w-full sm:w-auto bg-[#10305a] hover:bg-[#10305a]/90 text-white rounded-[10px]" disabled={sending}>
            {sending ? "送出中…" : "送出訊息"}
          </Button>
        </form>

        {/* Company Info Sidebar */}
        <aside className="space-y-8">
          <div>
            <h2 className="font-semibold mb-3 text-[#10305a]">聯絡資訊</h2>
            <dl className="space-y-3 text-sm text-[#687279]">
              <div>
                <dt className="font-medium text-[#10305a]">電子信箱</dt>
                <dd>
                  <a
                    href="mailto:hello@realreal.cc"
                    className="hover:underline"
                  >
                    hello@realreal.cc
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[#10305a]">客服電話</dt>
                <dd>(02) 2345-6789</dd>
              </div>
              <div>
                <dt className="font-medium text-[#10305a]">公司地址</dt>
                <dd>106 台北市大安區忠孝東路四段 100 號 10 樓</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="font-semibold mb-3 text-[#10305a]">營業時間</h2>
            <dl className="space-y-1 text-sm text-[#687279]">
              <div className="flex justify-between">
                <dt>週一至週五</dt>
                <dd>09:00 – 18:00</dd>
              </div>
              <div className="flex justify-between">
                <dt>週六</dt>
                <dd>10:00 – 14:00</dd>
              </div>
              <div className="flex justify-between">
                <dt>週日及國定假日</dt>
                <dd className="text-zinc-400">公休</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}
