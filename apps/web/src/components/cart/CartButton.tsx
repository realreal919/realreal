"use client"

import Link from "next/link"
import { ShoppingCart } from "lucide-react"
import { useCart } from "@/lib/cart"
import { useEffect, useState } from "react"

export function CartButton() {
  const items = useCart(s => s.items)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    useCart.persist.rehydrate()
    setHydrated(true)
  }, [])

  const count = hydrated ? items.reduce((sum, i) => sum + i.qty, 0) : 0

  return (
    <Link
      href="/checkout"
      className="relative inline-flex items-center justify-center h-10 w-10 rounded-md hover:bg-accent transition-colors"
      aria-label={`購物車 (${count} 件)`}
    >
      <ShoppingCart className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  )
}
