"use server"

import { revalidatePath } from "next/cache"
import { apiClient } from "@/lib/api-client"

export async function updateOrderStatusAction(id: string, status: string) {
  await apiClient(`/admin/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
    internal: true,
  })
  revalidatePath(`/admin/orders/${id}`)
}
