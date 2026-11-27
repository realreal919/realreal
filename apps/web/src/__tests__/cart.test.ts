import { describe, it, expect, beforeEach, vi } from "vitest"
import { toast } from "sonner"
import { useCart, type CartItem } from "@/lib/cart"

// Silence sonner toast calls。warning 也要 mock —— 卡在庫存／限購上限時走的是它。
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    variantId: "v1",
    productName: "Protein Powder",
    variantName: "1kg",
    price: 500,
    qty: 1,
    ...overrides,
  }
}

describe("Cart Zustand store", () => {
  beforeEach(() => {
    // Reset store to empty state before each test
    useCart.setState({ items: [] })
    vi.clearAllMocks()
  })

  /* ---- addItem ---- */

  describe("addItem", () => {
    it("adds an item to an empty cart", () => {
      useCart.getState().addItem(makeItem())
      const items = useCart.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].variantId).toBe("v1")
      expect(items[0].qty).toBe(1)
    })

    it("increments qty when adding a duplicate variantId", () => {
      useCart.getState().addItem(makeItem({ qty: 2 }))
      useCart.getState().addItem(makeItem({ qty: 3 }))
      const items = useCart.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].qty).toBe(5)
    })

    it("adds multiple different items", () => {
      useCart.getState().addItem(makeItem({ variantId: "v1" }))
      useCart.getState().addItem(makeItem({ variantId: "v2", productName: "Creatine" }))
      expect(useCart.getState().items).toHaveLength(2)
    })
  })

  /* ---- removeItem ---- */

  describe("removeItem", () => {
    it("removes an item by variantId", () => {
      useCart.getState().addItem(makeItem({ variantId: "v1" }))
      useCart.getState().addItem(makeItem({ variantId: "v2" }))
      useCart.getState().removeItem("v1")
      const items = useCart.getState().items
      expect(items).toHaveLength(1)
      expect(items[0].variantId).toBe("v2")
    })

    it("does nothing when removing a non-existent variantId", () => {
      useCart.getState().addItem(makeItem())
      useCart.getState().removeItem("non-existent")
      expect(useCart.getState().items).toHaveLength(1)
    })
  })

  /* ---- updateQty ---- */

  describe("updateQty", () => {
    it("updates the qty for a given variant", () => {
      useCart.getState().addItem(makeItem({ variantId: "v1", qty: 1 }))
      useCart.getState().updateQty("v1", 5)
      expect(useCart.getState().items[0].qty).toBe(5)
    })

    it("removes the item when qty is set to 0", () => {
      useCart.getState().addItem(makeItem({ variantId: "v1" }))
      useCart.getState().updateQty("v1", 0)
      expect(useCart.getState().items).toHaveLength(0)
    })

    it("removes the item when qty is negative", () => {
      useCart.getState().addItem(makeItem({ variantId: "v1" }))
      useCart.getState().updateQty("v1", -3)
      expect(useCart.getState().items).toHaveLength(0)
    })
  })

  /* ---- clear ---- */

  describe("clear", () => {
    it("removes all items from the cart", () => {
      useCart.getState().addItem(makeItem({ variantId: "v1" }))
      useCart.getState().addItem(makeItem({ variantId: "v2" }))
      useCart.getState().clear()
      expect(useCart.getState().items).toHaveLength(0)
    })

    it("is safe to call on an already empty cart", () => {
      useCart.getState().clear()
      expect(useCart.getState().items).toHaveLength(0)
    })
  })

  /* ---- total ---- */

  describe("total", () => {
    it("returns 0 for an empty cart", () => {
      expect(useCart.getState().total()).toBe(0)
    })

    it("calculates total as sum of price * qty", () => {
      useCart.getState().addItem(makeItem({ variantId: "v1", price: 500, qty: 2 }))
      useCart.getState().addItem(makeItem({ variantId: "v2", price: 300, qty: 3 }))
      // 500*2 + 300*3 = 1900
      expect(useCart.getState().total()).toBe(1900)
    })

    it("reflects updated qty in total", () => {
      useCart.getState().addItem(makeItem({ variantId: "v1", price: 100, qty: 1 }))
      useCart.getState().updateQty("v1", 10)
      expect(useCart.getState().total()).toBe(1000)
    })

    it("returns 0 after clearing the cart", () => {
      useCart.getState().addItem(makeItem({ price: 999, qty: 5 }))
      useCart.getState().clear()
      expect(useCart.getState().total()).toBe(0)
    })
  })
})

/* ---- 限購（每張訂單的單一規格上限） ---- */

describe("limitQty", () => {
  // 這個 describe 在外層 describe 之外，外層的 beforeEach 吃不到 —— 自己清。
  beforeEach(() => {
    useCart.setState({ items: [] })
    vi.clearAllMocks()
  })

  it("加到上限就停住，而且說的是限購不是缺貨", () => {
    useCart.getState().addItem(makeItem({ qty: 2, stockQty: 6, limitQty: 2 }))
    useCart.getState().addItem(makeItem({ qty: 1, stockQty: 6, limitQty: 2 }))
    expect(useCart.getState().items[0].qty).toBe(2)
    expect(toast.warning).toHaveBeenCalledWith("每張訂單限購 2 件")
  })

  it("庫存比限購更緊時，講的是庫存", () => {
    useCart.getState().addItem(makeItem({ qty: 1, stockQty: 1, limitQty: 5 }))
    useCart.getState().addItem(makeItem({ qty: 1, stockQty: 1, limitQty: 5 }))
    expect(useCart.getState().items[0].qty).toBe(1)
    expect(toast.warning).toHaveBeenCalledWith("已達庫存上限（1 件）")
  })

  it("一次加超過上限會被夾到上限，不是整筆拒絕", () => {
    useCart.getState().addItem(makeItem({ qty: 9, stockQty: 6, limitQty: 2 }))
    expect(useCart.getState().items[0].qty).toBe(2)
  })

  it("updateQty 也擋得住 —— 購物車裡直接改數量是另一條路", () => {
    useCart.getState().addItem(makeItem({ qty: 1, stockQty: 6, limitQty: 2 }))
    useCart.getState().updateQty("v1", 5)
    expect(useCart.getState().items[0].qty).toBe(2)
    expect(toast.warning).toHaveBeenCalledWith("每張訂單限購 2 件")
  })

  it("後來那筆沒帶 limitQty 時，沿用這一行原本記得的上限", () => {
    // 購物車抽屜的「＋加」若漏帶限購，不能因此變成無限
    useCart.getState().addItem(makeItem({ qty: 2, stockQty: 6, limitQty: 2 }))
    useCart.getState().addItem(makeItem({ qty: 1, stockQty: 6 }))
    expect(useCart.getState().items[0].qty).toBe(2)
  })

  it("沒有限購的商品不受影響", () => {
    useCart.getState().addItem(makeItem({ qty: 20, stockQty: 100 }))
    expect(useCart.getState().items[0].qty).toBe(20)
  })
})
