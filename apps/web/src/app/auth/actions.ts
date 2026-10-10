"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { z } from "zod"

// Relaxed to min(1): imported WordPress users may have set passwords <8 chars
// back when WP allowed weaker minimums. Validation still rejects empties; the
// legacy-fallback path then handles auth via the stored PHPass hash. Register
// flow still enforces ≥8.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  // 生日選填 —— 註冊當下填寫率最高，但多一個必填欄位會拉低完成率。空字串
  // (使用者沒填) 一律轉成 undefined，不要送一個空值進 user metadata。
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => {
      const t = Date.parse(`${d}T00:00:00Z`)
      return Number.isFinite(t) && t <= Date.now() && d > "1900-01-01"
    })
    .optional(),
})

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://realreal.cc").replace(/\/+$/, "")
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: "請填入有效的 Email 和密碼" }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    // WordPress-import legacy fallback (added 2026-06-30 when 72 users were
    // imported from the old WP site). Supabase rejected the (email, password)
    // pair — could be a real wrong password, or an imported user whose
    // encrypted_password is a random throwaway and whose real PHPass hash
    // lives on user_profiles.wp_legacy_password_hash. Ask the API to verify
    // against the WP hash and, on success, re-hash to bcrypt; then we retry
    // signInWithPassword and let it succeed normally.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
    try {
      const r = await fetch(`${apiUrl}/auth/legacy/verify-and-migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        // Server action runs server-side; no browser CORS concern.
      })
      const body = (await r.json().catch(() => ({}))) as { migrated?: boolean }
      if (r.ok && body.migrated) {
        const { error: retryErr } = await supabase.auth.signInWithPassword(parsed.data)
        if (retryErr) return { error: retryErr.message }
        // success — fall through to redirect below
      } else {
        return { error: error.message }
      }
    } catch {
      return { error: error.message }
    }
  }

  // Only allow same-origin relative paths. An attacker-supplied absolute or
  // protocol-relative URL (?redirect=//evil.example) would otherwise bounce the
  // freshly-authenticated user to a phishing site.
  const requested = (formData.get("redirectTo") as string) || "/"
  const redirectTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/"
  redirect(redirectTo)
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const rawBirthday = String(formData.get("birthday") ?? "").trim()
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    birthday: rawBirthday === "" ? undefined : rawBirthday,
  })
  if (!parsed.success) {
    // 生日是選填，所以它自己壞掉時要講清楚是哪一欄 —— 不然使用者會盯著必填
    // 欄位找錯，而那些都填對了。
    const badBirthday = parsed.error.issues.some((i) => i.path[0] === "birthday")
    return {
      error: badBirthday
        ? "生日格式不正確，請確認日期並非未來日期"
        : "請確認所有欄位填寫正確",
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // 生日先進 user metadata，帳號建立後由 user_profiles 的
      // copy_birthday_from_signup trigger 搬進 profile
      // (migration 202609040036)。沒填就不要放這個 key。
      data: {
        display_name: parsed.data.displayName,
        ...(parsed.data.birthday ? { birthday: parsed.data.birthday } : {}),
      },
      // Point signup confirmation at the device-independent token-hash handler
      // so the confirm link works even when opened on a different device. As
      // with recovery, the Supabase dashboard "Confirm signup" email template
      // MUST use the token-hash URL:
      //   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/
      // (See docs/auth-email-templates.md.) The /auth/callback PKCE route still
      // works for the same-device case.
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=/`,
    },
  })
  if (error) return { error: error.message }
  return { success: "註冊成功！請檢查您的信箱並點擊確認連結以完成註冊" }
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const parsed = z.object({ email: z.string().email() }).safeParse({
    email: formData.get("email"),
  })
  if (!parsed.success) return { error: "請輸入有效的 Email" }
  const email = parsed.data.email

  // 先問後端這個信箱有沒有帳號。
  //
  // Supabase 對不存在的帳號不回傳 error（防止有人拿忘記密碼當工具去試探
  // 誰是會員），所以光看它的回應永遠是成功。沒註冊過的人會一直等一封不存在
  // 的信，而且不知道下一步該做什麼 —— 店主自己就踩過。
  //
  // 2026-10-10 店主決定誠實告知。代價是「帳號列舉」變得可行，所以那支端點
  // 有頻率限制（同一 IP 每分鐘 10 次）。查不出來時不猜，繼續走原本的流程。
  try {
    const res = await fetch(`${process.env.RAILWAY_API_URL}/auth/email-exists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    })
    if (res.ok) {
      const { exists } = (await res.json()) as { exists?: boolean }
      if (exists === false) return { notRegistered: true as const }
    }
  } catch {
    // 查詢失敗不要擋住重設流程，往下走就是原本的行為
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Point recovery at the device-independent token-hash handler so the reset
    // link works even when opened on a different device than the one that
    // requested it (e.g. request on desktop, open on phone). /auth/confirm uses
    // verifyOtp({ token_hash, type }) which does NOT need the PKCE verifier
    // cookie, unlike the /auth/callback exchangeCodeForSession path.
    //
    // IMPORTANT: this `redirectTo` only sets {{ .SiteURL }} / {{ .RedirectTo }}
    // for the email; it does NOT by itself switch the email to the token-hash
    // link. The Supabase dashboard "Reset Password" email template MUST be set
    // to use the token-hash URL:
    //   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password
    // See docs/auth-email-templates.md for the full dashboard instructions.
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/auth/reset-password`,
  })
  if (error) return { error: error.message }

  // 措辭刻意是「如果…就已寄出」而不是「已寄出」。
  //
  // Supabase 對不存在的帳號不回傳 error（防止有人拿忘記密碼當工具，一個一個試出
  // 哪些 email 是會員），所以這裡永遠走到成功分支。斷言「已寄出」的話，沒註冊過
  // 的人會一直等一封不存在的信，而且會以為是系統壞了 —— 店主自己就踩過這個坑。
  return {
    success: "如果這個信箱已經註冊過，重設連結已經寄出，請檢查信箱（含垃圾郵件匣）。",
  }
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const parsed = z.object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  }).safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) return { error: "密碼至少需要 8 個字元" }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: "兩次輸入的密碼不一致" }
  }

  const supabase = await createClient()

  // The recovery token is redeemed HERE, not when the emailed link is opened.
  // Link scanners (Outlook/Hotmail "Safe Links") GET every URL in a delivered
  // message; if the token were burned on that GET the customer's own click
  // would always hit an already-used token and bounce back to forgot-password
  // forever. A form POST is never issued by a scanner, so redeeming at submit
  // time is what makes the flow survive those inboxes.
  const tokenHash = formData.get("token_hash")
  if (typeof tokenHash === "string" && tokenHash.length > 0) {
    const { error: otpError } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    })
    if (otpError) {
      return { error: "重設密碼連結已失效或已使用，請重新寄送連結" }
    }
  }
  // No token_hash → the caller already holds a recovery session (legacy links
  // that were verified by /auth/confirm, or a logged-in user changing their
  // password). updateUser below still requires that session, so an anonymous
  // request without a token simply fails with Supabase's own auth error.

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: error.message }

  redirect("/")
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}
