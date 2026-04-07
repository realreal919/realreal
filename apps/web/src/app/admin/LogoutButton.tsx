"use client"

import { LogOut } from "lucide-react"
import { logoutAction } from "@/app/auth/actions"

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-[10px] text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
      >
        <LogOut className="w-4 h-4 shrink-0" />
        登出
      </button>
    </form>
  )
}
