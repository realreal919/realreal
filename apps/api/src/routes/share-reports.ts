import { Router } from "express"
import { supabase } from "../lib/supabase"
import { optionalAuth } from "../middleware/auth"
import { decodeScreenshot, validateShareReport } from "../lib/share-report"

export const shareReportsRouter = Router()

/**
 * POST /share-reports —— 會員回報自己做過的分享。
 *
 * 公開端點（未登入也能送，填 Email 讓管理者事後對應），所以：
 *   - honeypot 擋機器人，命中時回 200 假裝成功，不讓對方知道被擋了
 *   - 不回傳任何既有資料，只寫入
 *
 * 類型與點數完全不在這裡決定 —— 會員看到的只有「我分享了，請看看」。
 */
shareReportsRouter.post("/", optionalAuth, async (req, res) => {
  const userId = (req as { user?: { id?: string } }).user?.id ?? null
  const body = (req.body ?? {}) as Record<string, unknown>

  const parsed = validateShareReport(
    {
      link: body.link as string | undefined,
      screenshot: body.screenshot as string | undefined,
      message: body.message as string | undefined,
      email: body.email as string | undefined,
      website: body.website as string | undefined,
    },
    { isMember: !!userId },
  )

  if (!parsed.ok) {
    // honeypot：照成功回應，機器人不會知道這一筆被丟掉了
    if (parsed.error === "__silent__") {
      res.json({ ok: true })
      return
    }
    res.status(400).json({ error: parsed.error })
    return
  }

  // 會員的 Email 以帳號為準，不採信表單送來的值
  let email = parsed.email
  if (userId) {
    const { data } = await supabase.auth.admin.getUserById(userId)
    email = data.user?.email ?? email
  }

  // 截圖存進 storage，資料表只放網址
  let screenshotUrl: string | null = null
  const rawShot = typeof body.screenshot === "string" ? body.screenshot : ""
  if (rawShot.trim()) {
    const decoded = decodeScreenshot(rawShot)
    if ("error" in decoded) {
      res.status(400).json({ error: decoded.error })
      return
    }
    const path = `share-reports/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${decoded.ext}`
    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(path, decoded.buffer, { contentType: decoded.contentType, upsert: false })
    if (upErr) {
      console.error("[share-reports] 截圖上傳失敗:", upErr)
      res.status(500).json({ error: "截圖上傳失敗，請再試一次" })
      return
    }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path)
    screenshotUrl = pub.publicUrl
  }

  // 同一個連結先前送過就標重複。送出當下判定並寫死 —— 事後再算的話，
  // 哪一筆算「第一筆」會隨查詢時間變動。
  let isDuplicate = false
  if (parsed.link) {
    const { count } = await supabase
      .from("share_reports")
      .select("id", { count: "exact", head: true })
      .eq("link", parsed.link)
    isDuplicate = (count ?? 0) > 0
  }

  const { error } = await supabase.from("share_reports").insert({
    user_id: userId,
    email,
    link: parsed.link,
    screenshot_url: screenshotUrl,
    message: parsed.message,
    is_duplicate: isDuplicate,
  })
  if (error) {
    console.error("[share-reports] 寫入失敗:", error)
    res.status(500).json({ error: "送出失敗，請再試一次" })
    return
  }

  res.json({ ok: true })
})
