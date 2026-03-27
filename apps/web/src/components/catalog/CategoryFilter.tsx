"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import type { Category } from "@/lib/catalog"

export function CategoryFilter({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const sp = useSearchParams()
  const current = sp.get("category")

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={!current ? "default" : "outline"}
        size="sm"
        onClick={() => router.push("/shop")}
      >全部</Button>
      {categories.map(cat => (
        <Button
          key={cat.id}
          variant={current === cat.slug ? "default" : "outline"}
          size="sm"
          onClick={() => router.push(`/shop?category=${cat.slug}`)}
        >{cat.name}</Button>
      ))}
    </div>
  )
}
