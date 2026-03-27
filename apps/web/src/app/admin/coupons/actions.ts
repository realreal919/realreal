"use server"

import { revalidatePath } from "next/cache"
import { apiClient } from "@/lib/api-client"

interface CreateCouponInput {
  code: string
  type: string
  value: number
  max_uses: number | null
  expires_at: string | null
}

export async function createCouponAction(input: CreateCouponInput) {
  await apiClient("/admin/coupons", {
    method: "POST",
    body: JSON.stringify(input),
    internal: true,
  })
  revalidatePath("/admin/coupons")
}
