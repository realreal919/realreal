import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AdminProductEditClient from "./_client"

export default async function AdminProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("user_id", user.id).single()
  if (profile?.role !== "admin") redirect("/")

  const { data: product } = await supabase.from("products").select("*").eq("id", id).single()
  if (!product) notFound()

  return <AdminProductEditClient product={product} />
}
