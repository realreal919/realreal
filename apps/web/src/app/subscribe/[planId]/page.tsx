"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { apiClient } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface Plan {
  id: string
  name: string
  interval: string
  price: string
  benefits: Record<string, unknown> | null
}

export default function SubscribeConfirmPage() {
  const { planId } = useParams<{ planId: string }>()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [error, setError] = useState("")

  const handleSubscribeWithToken = useCallback(
    async (token: string) => {
      setIsSubscribing(true)
      setError("")
      try {
        await apiClient("/api/subscriptions", {
          method: "POST",
          body: JSON.stringify({ planId, paymentToken: token }),
        })
        toast.success("訂閱成功！")
        router.push("/my-account/subscriptions")
      } catch {
        setError("訂閱建立失敗，請再試一次")
        setIsSubscribing(false)
      }
    },
    [planId, router]
  )

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) setError("找不到此方案")
        else setPlan(data as Plan)
        setIsLoading(false)
      })
  }, [planId])

  // Handle return from PChomePay: ?pchomepay_token= param → call POST /subscriptions
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("pchomepay_token")
    if (token && planId) {
      handleSubscribeWithToken(token)
    }
  }, [planId, handleSubscribeWithToken])

  function handleRegisterToken() {
    if (!plan) return
    // Redirect to PChomePay token registration page.
    // After registration, PChomePay redirects back with ?pchomepay_token=...
    // MerchantOrderNo is TOKREG_{subscriptionId} — we use planId as a placeholder
    // before the subscription is created; the webhook updates the token after creation.
    const returnUrl = encodeURIComponent(`${window.location.origin}/subscribe/${planId}`)
    const registrationUrl =
      `https://payment.pchomepay.com.tw/api/token/register` +
      `?MerchantID=${process.env.NEXT_PUBLIC_PCHOMEPAY_MERCHANT_ID ?? ""}` +
      `&ReturnURL=${returnUrl}` +
      `&MerchantOrderNo=TOKREG_${planId}` +
      `&TokenTerm=RealReal_recurring`
    window.location.href = registrationUrl
  }

  if (isLoading) return <div className="flex justify-center py-20 text-zinc-500">載入中…</div>
  if (!plan && error) return <div className="flex justify-center py-20 text-red-600">{error}</div>
  if (!plan) return null

  const intervalLabel = plan.interval === "bimonthly" ? "每兩個月" : "每個月"

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">確認訂閱</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{plan.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <span className="text-zinc-500">訂閱週期</span>
            <span>{intervalLabel}自動扣款</span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-zinc-500">每期金額</span>
            <span className="text-xl font-bold">NT${Number(plan.price).toLocaleString()}</span>
          </div>
          <p className="text-xs text-zinc-400 mt-4">
            訂閱後將以 PChomePay 綁定信用卡自動扣款。您可隨時在帳戶中暫停或取消訂閱。
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={handleRegisterToken}
        disabled={isSubscribing}
      >
        {isSubscribing ? "處理中…" : "以 PChomePay 設定定期扣款"}
      </Button>

      <p className="text-center text-xs text-zinc-400 mt-4">
        系統採用 PChomePay Token 加密儲存，我們不直接儲存您的卡號。
      </p>
    </div>
  )
}
