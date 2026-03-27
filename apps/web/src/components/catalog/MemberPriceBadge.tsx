import { Badge } from "@/components/ui/badge"

interface MemberPriceBadgeProps {
  price: number
  discountRate: number // 0-1, e.g. 0.03 = 3% off
  isLoggedIn: boolean
}

export function MemberPriceBadge({ price, discountRate, isLoggedIn }: MemberPriceBadgeProps) {
  if (isLoggedIn && discountRate > 0) {
    const memberPrice = Math.round(price * (1 - discountRate))
    return (
      <Badge variant="default" className="bg-amber-500 hover:bg-amber-500/80 text-white">
        會員價 NT${memberPrice.toLocaleString()}
      </Badge>
    )
  }

  if (!isLoggedIn && discountRate > 0) {
    const discountDisplay = Math.round((1 - discountRate) * 10)
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        加入會員享{discountDisplay}折
      </Badge>
    )
  }

  return null
}
