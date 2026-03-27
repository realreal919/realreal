"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Category } from "@/lib/catalog"

interface CategoryFilterProps {
  categories: Category[]
  /** When rendered as sidebar, applies vertical layout */
  layout?: "horizontal" | "sidebar"
}

export function CategoryFilter({ categories, layout = "horizontal" }: CategoryFilterProps) {
  const router = useRouter()
  const sp = useSearchParams()
  const current = sp.get("category")

  function navigate(slug?: string) {
    const params = new URLSearchParams(sp.toString())
    if (slug) {
      params.set("category", slug)
    } else {
      params.delete("category")
    }
    // Reset to page 1 when changing category
    params.delete("page")
    router.push(`/shop?${params.toString()}`)
  }

  const isSidebar = layout === "sidebar"

  return (
    <nav
      className={cn(
        isSidebar
          ? "flex flex-col gap-1"
          : "flex gap-2 overflow-x-auto pb-2 scrollbar-thin -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible md:pb-0"
      )}
      aria-label="商品分類"
    >
      <CategoryButton
        active={!current}
        onClick={() => navigate()}
        layout={layout}
      >
        全部商品
      </CategoryButton>
      {categories.map(cat => (
        <CategoryButton
          key={cat.id}
          active={current === cat.slug}
          onClick={() => navigate(cat.slug)}
          count={cat.product_count}
          layout={layout}
        >
          {cat.name}
        </CategoryButton>
      ))}
    </nav>
  )
}

function CategoryButton({
  active,
  onClick,
  children,
  count,
  layout,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
  layout: "horizontal" | "sidebar"
}) {
  const isSidebar = layout === "sidebar"

  if (isSidebar) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors text-left",
          active
            ? "bg-primary text-primary-foreground font-medium"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <span>{children}</span>
        {count != null && (
          <span className={cn(
            "text-xs tabular-nums",
            active ? "text-primary-foreground/70" : "text-muted-foreground/60"
          )}>
            {count}
          </span>
        )}
      </button>
    )
  }

  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(
        "shrink-0 transition-all",
        active && "shadow-sm"
      )}
    >
      {children}
      {count != null && (
        <span className={cn(
          "ml-1 text-xs",
          active ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          ({count})
        </span>
      )}
    </Button>
  )
}
