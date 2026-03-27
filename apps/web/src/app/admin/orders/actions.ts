"use server"

import { revalidatePath } from "next/cache"
import { apiClient } from "@/lib/api-client"

export async function updateOrderStatusAction(id: string, status: string) {
  await apiClient(`/admin/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
  revalidatePath("/admin/orders")
}

export async function bulkUpdateOrderStatusAction(ids: string[], status: string) {
  await apiClient("/admin/orders/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  })
  revalidatePath("/admin/orders")
}
