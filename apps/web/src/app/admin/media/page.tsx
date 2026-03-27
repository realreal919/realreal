import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { MediaGrid } from "./_components/MediaGrid"
import { MediaUploader } from "./_components/MediaUploader"

export const metadata = { title: "媒體庫 | Admin" }

interface MediaItem {
  id: string
  url: string
  filename: string
  size: number
  alt_text: string | null
  mime_type: string
  created_at: string
}

interface MediaResponse {
  media: MediaItem[]
}

export default async function AdminMediaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login?redirect=/admin/media")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single()

  if (!profile || !["admin", "editor"].includes(profile.role)) redirect("/")

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

  let media: MediaItem[] = []

  try {
    const res = await fetch(`${API_URL}/admin/media`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 30 },
    })
    if (res.ok) {
      const data: MediaResponse = await res.json()
      media = data.media ?? []
    }
  } catch {
    // API unavailable — show empty state
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#10305a]">媒體庫</h1>
      </div>

      <MediaUploader />

      <MediaGrid items={media} />
    </div>
  )
}
