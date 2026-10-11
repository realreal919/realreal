import { describe, expect, it } from "vitest"
import { mapBuyGetOffers } from "../buy-get-offers"

const NOW = "2026-10-11T00:00:00.000Z"

describe("mapBuyGetOffers", () => {
  it("buy_x_get_y 用 copy_label，標為可重複", () => {
    expect(
      mapBuyGetOffers(
        [
          {
            name: "300克夾鏈袋 買 10 送 1",
            type: "buy_x_get_y",
            config: {
              scope: "variants",
              copy_label: "300克夾鏈袋",
              buy_quantity: 10,
              get_quantity: 1,
              free_item_rule: "lowest_price",
            },
          },
        ],
        NOW,
      ),
    ).toEqual([
      { label: "300克夾鏈袋", buyQty: 10, getQty: 1, repeats: true, freeRule: "lowest_price" },
    ])
  })

  it("★ scope=all 不拿活動名稱當 label（否則文案會疊成「買10送1買10送1」）", () => {
    const [offer] = mapBuyGetOffers(
      [
        {
          name: "全部品項任選買10送1",
          type: "bundle",
          config: { scope: "all", buy_quantity: 10, get_quantity: 1, free_item_rule: "lowest_price" },
        },
      ],
      NOW,
    )
    expect(offer.label).toBe("全館任選")
    expect(offer.label).not.toContain("買10送1")
  })

  it("bundle 標為不可重複（整筆訂單只免一次）", () => {
    const [offer] = mapBuyGetOffers(
      [{ name: "x", type: "bundle", config: { scope: "all", buy_quantity: 10, get_quantity: 1 } }],
      NOW,
    )
    expect(offer.repeats).toBe(false)
  })

  it("★ 舊種子資料的 free_quantity 也要讀得到，不然整條會被濾掉", () => {
    const [offer] = mapBuyGetOffers(
      [
        {
          name: "舊 bundle",
          type: "bundle",
          config: { scope: "all", buy_quantity: 10, free_quantity: 2 },
        },
      ],
      NOW,
    )
    expect(offer.getQty).toBe(2)
  })

  it("get_quantity 優先於 free_quantity（後台改過的值要贏）", () => {
    const [offer] = mapBuyGetOffers(
      [
        {
          name: "x",
          type: "bundle",
          config: { scope: "all", buy_quantity: 10, get_quantity: 1, free_quantity: 5 },
        },
      ],
      NOW,
    )
    expect(offer.getQty).toBe(1)
  })

  it("highest_price 會原樣帶出來，其餘一律當 lowest_price", () => {
    const rows = [
      { name: "a", type: "bundle", config: { scope: "all", buy_quantity: 2, get_quantity: 1, free_item_rule: "highest_price" } },
      { name: "b", type: "bundle", config: { scope: "all", buy_quantity: 2, get_quantity: 1 } },
    ]
    expect(mapBuyGetOffers(rows, NOW).map((o) => o.freeRule)).toEqual([
      "highest_price",
      "lowest_price",
    ])
  })

  it("已結束的活動不出現；沒設結束日的留著", () => {
    const rows = [
      { name: "過期", type: "bundle", config: { scope: "all", buy_quantity: 2, get_quantity: 1 }, ends_at: "2026-10-10T00:00:00.000Z" },
      { name: "沒設", type: "bundle", config: { scope: "all", buy_quantity: 2, get_quantity: 1 }, ends_at: null },
    ]
    expect(mapBuyGetOffers(rows, NOW).map((o) => o.buyQty)).toEqual([2])
  })

  it("缺件數或缺名稱的活動不出現，不會變成「買0送0」", () => {
    const rows = [
      { name: "", type: "bundle", config: { scope: "variants", buy_quantity: 10, get_quantity: 1 } },
      { name: "沒件數", type: "bundle", config: { scope: "all", get_quantity: 1 } },
      { name: "件數壞掉", type: "bundle", config: { scope: "all", buy_quantity: "abc", get_quantity: 1 } },
    ]
    expect(mapBuyGetOffers(rows, NOW)).toEqual([])
  })

  it("沒有活動時回空陣列", () => {
    expect(mapBuyGetOffers([], NOW)).toEqual([])
  })
})
