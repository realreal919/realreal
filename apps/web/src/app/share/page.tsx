import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { ShareReportForm } from "./_client"

export const metadata: Metadata = {
  title: "分享回報 | 誠真生活 RealReal",
  description: "把你的分享告訴誠真生活，我們看過會通知你。",
}

export default async function ShareReportPage() {
  // 已登入就不顯示 Email 欄位 —— 帳號上的信箱才是對得到人的那一個，
  // 讓人再填一次只會多一個填錯的機會。
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const memberEmail = data.user?.email ?? null

  return (
    <div className="container mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold text-[#10305a]">告訴我們你的分享</h1>
      <p className="mb-8 text-[#687279]">貼上連結或傳張截圖就好，我們看過會通知你。</p>
      <ShareReportForm memberEmail={memberEmail} />
    </div>
  )
}
