import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "sonner"

export type CartItem = {
  variantId: string
  productName: string
  variantName: string
  price: number
  /** Original (non-sale) price — kept for strikethrough display in checkout. */
  originalPrice?: number
  qty: number
  /** Latest known stock for the variant — used to clamp adds/updates. */
  stockQty?: number
  /**
   * 這個規格的每張訂單限購數（後端 attributes 的「限購」算出來的）。
   *
   * 不把它併進 stockQty：併進去雖然擋得住，但提示會變成「已達庫存上限」——
   * 明明還有貨，客人只會以為快賣完了。兩個上限分開存，訊息才講得出實話。
   */
  limitQty?: number
  imageUrl?: string
  /**
   * Whether this line is an add-on item (product.is_addon=true). DISPLAY ONLY —
   * carried so the cart/drawer can show the 加購價 discount. The server
   * (/orders/preview) ignores client prices and computes the real charge.
   */
  isAddon?: boolean
  /** Per-variant add-on price (NT$). DISPLAY ONLY — see isAddon above. */
  addonPrice?: number
}

type CartStore = {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (variantId: string) => void
  updateQty: (variantId: string, qty: number) => void
  updatePrice: (variantId: string, price: number, originalPrice?: number) => void
  clear: () => void
  total: () => number
}

/** 卡在上限時要說的話。限購優先講 —— 有貨卻買不到更多，原因是限購不是缺貨。 */
export function capMessage(stockCap: number, limitCap: number): string {
  if (limitCap <= stockCap && Number.isFinite(limitCap)) return `每張訂單限購 ${limitCap} 件`
  return `已達庫存上限（${stockCap} 件）`
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.variantId === item.variantId)
          // Stock cap — use the latest known stockQty from either the incoming
          // item or the existing line (the product page snapshots it at add time).
          const stockCap = item.stockQty ?? existing?.stockQty ?? Infinity
          const limitCap = item.limitQty ?? existing?.limitQty ?? Infinity
          const cap = Math.min(stockCap, limitCap)
          if (existing) {
            const newQty = Math.min(existing.qty + item.qty, cap)
            if (newQty === existing.qty) {
              toast.warning(capMessage(stockCap, limitCap))
              return state
            }
            toast.success("已加入購物車")
            return {
              items: state.items.map((i) =>
                i.variantId === item.variantId
                  ? { ...i, qty: newQty, stockQty: item.stockQty ?? i.stockQty, limitQty: item.limitQty ?? i.limitQty, price: item.price ?? i.price, originalPrice: item.originalPrice ?? i.originalPrice }
                  : i,
              ),
            }
          }
          const newQty = Math.min(item.qty, cap)
          if (newQty <= 0) {
            toast.error("此商品目前缺貨")
            return state
          }
          toast.success("已加入購物車")
          return { items: [...state.items, { ...item, qty: newQty }] }
        }),
      removeItem: (variantId) =>
        set((state) => ({ items: state.items.filter((i) => i.variantId !== variantId) })),
      updateQty: (variantId, qty) =>
        set((state) => {
          if (qty <= 0) {
            return { items: state.items.filter((i) => i.variantId !== variantId) }
          }
          return {
            items: state.items.map((i) => {
              if (i.variantId !== variantId) return i
              const stockCap = i.stockQty ?? Infinity
              const limitCap = i.limitQty ?? Infinity
              const clamped = Math.min(qty, stockCap, limitCap)
              if (clamped < qty) toast.warning(capMessage(stockCap, limitCap))
              return { ...i, qty: clamped }
            }),
          }
        }),
      updatePrice: (variantId, price, originalPrice) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.variantId === variantId
              ? { ...i, price, ...(originalPrice !== undefined ? { originalPrice } : {}) }
              : i,
          ),
        })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
    }),
    { name: "realreal-cart", skipHydration: true },
  ),
)
