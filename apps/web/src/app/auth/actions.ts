"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { z } from "zod"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: "請填入有效的 Email 和密碼（至少 8 字元）" }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: error.message }

  redirect("/my-account")
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().min(1),
  }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  })
  if (!parsed.success) return { error: "請確認所有欄位填寫正確" }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  })
  if (error) return { error: error.message }

  redirect("/my-account")
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = formData.get("email")?.toString()
  if (!email) return { error: "請輸入 Email" }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
  })
  if (error) return { error: error.message }

  return { success: "重設密碼連結已寄出，請檢查您的信箱" }
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}
