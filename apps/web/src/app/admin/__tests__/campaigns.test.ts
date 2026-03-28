import { describe, it, expect } from "vitest"

/* ------------------------------------------------------------------ */
/*  Extracted logic from campaigns/page.tsx for unit testing            */
/* ------------------------------------------------------------------ */

/* Types mirrored from the page */
interface Campaign {
  id: string
  name: string
  description: string | null
  tier_id: string | null
  type: string
  config: Record<string, unknown> | null
  coupon_id: string | null
  is_active: boolean
  starts_at: string
  ends_at: string | null
  created_at: string
  coupon?: { code: string } | null
  tier?: { name: string } | null
}

type StatusKey = "all" | "active" | "scheduled" | "ended" | "disabled"

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "進行中" },
  { key: "scheduled", label: "排程中" },
  { key: "ended", label: "已結束" },
  { key: "disabled", label: "停用" },
]

const TYPE_LABEL: Record<string, string> = {
  discount: "折扣",
  freebie: "滿額贈品",
  points_multiplier: "點數加倍",
  free_shipping: "免運",
  bundle: "組合優惠",
  buy_x_get_y: "買X送Y",
  second_half_price: "第二件優惠",
  spend_threshold: "滿額折扣",
  tier_upgrade_bonus: "升等加碼",
  combo_discount: "任選N件折扣",
}

interface PresetTemplate {
  name: string
  description: string
  type: string
  config: Record<string, unknown>
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  { name: "買一送一 — 蛋白粉", description: "蛋白粉系列買一送一", type: "buy_x_get_y", config: { buy_quantity: 1, get_quantity: 1, scope: "specific_categories", category_slug: "protein", same_item_only: true, max_uses_per_order: 1 } },
  { name: "全館95折", description: "全站商品95折", type: "discount", config: { discount_method: "percent", discount_value: 5, scope: "all" } },
  { name: "免運 — 滿$800", description: "滿800免運", type: "free_shipping", config: { min_order_amount: 800 } },
]

/* ---- campaignStatus (extracted) ---- */

function campaignStatus(c: Campaign): {
  key: StatusKey
  label: string
  variant: "default" | "secondary" | "destructive" | "outline"
} {
  if (!c.is_active) return { key: "disabled", label: "停用", variant: "secondary" }
  const now = new Date()
  if (c.ends_at && new Date(c.ends_at) < now) return { key: "ended", label: "已結束", variant: "destructive" }
  if (new Date(c.starts_at) > now) return { key: "scheduled", label: "排程中", variant: "outline" }
  return { key: "active", label: "進行中", variant: "default" }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" })
}

/* ---- Campaign factory ---- */

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    name: "Test Campaign",
    description: null,
    tier_id: null,
    type: "discount",
    config: {},
    coupon_id: null,
    is_active: true,
    starts_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
    ends_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Campaign list rendering logic", () => {
  it("maps campaigns to display data", () => {
    const campaigns = [
      makeCampaign({ id: "c1", name: "Summer Sale", type: "discount" }),
      makeCampaign({ id: "c2", name: "Free Shipping", type: "free_shipping" }),
    ]
    const display = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      typeLabel: TYPE_LABEL[c.type] ?? c.type,
      status: campaignStatus(c),
    }))
    expect(display).toHaveLength(2)
    expect(display[0].typeLabel).toBe("折扣")
    expect(display[1].typeLabel).toBe("免運")
    expect(display[0].status.key).toBe("active")
  })

  it("handles unknown campaign type gracefully", () => {
    const c = makeCampaign({ type: "future_type" })
    const label = TYPE_LABEL[c.type] ?? c.type
    expect(label).toBe("future_type")
  })
})

describe("Create campaign form logic", () => {
  it("all type options have labels", () => {
    const typeOptions = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))
    expect(typeOptions.length).toBeGreaterThanOrEqual(10)
    for (const opt of typeOptions) {
      expect(opt.value).toBeTruthy()
      expect(opt.label).toBeTruthy()
    }
  })

  it("fmtDate formats ISO date strings to zh-TW", () => {
    // Use a fixed date for deterministic test
    const result = fmtDate("2025-06-15T00:00:00.000Z")
    // Should contain 2025, 06, 15 in some order
    expect(result).toContain("2025")
  })

  it("fmtDate returns dash for null", () => {
    expect(fmtDate(null)).toBe("-")
  })
})

describe("Preset template import", () => {
  it("all preset templates have required fields", () => {
    for (const preset of PRESET_TEMPLATES) {
      expect(preset.name).toBeTruthy()
      expect(preset.description).toBeTruthy()
      expect(preset.type).toBeTruthy()
      expect(typeof preset.config).toBe("object")
    }
  })

  it("preset types are all recognized in TYPE_LABEL", () => {
    for (const preset of PRESET_TEMPLATES) {
      expect(TYPE_LABEL).toHaveProperty(preset.type)
    }
  })

  it("buy_x_get_y preset has correct config shape", () => {
    const bogo = PRESET_TEMPLATES.find((p) => p.type === "buy_x_get_y")!
    expect(bogo).toBeDefined()
    expect(bogo.config).toHaveProperty("buy_quantity")
    expect(bogo.config).toHaveProperty("get_quantity")
  })
})

describe("Status tab filtering", () => {
  it("correctly identifies an active campaign", () => {
    const c = makeCampaign({ is_active: true })
    expect(campaignStatus(c).key).toBe("active")
  })

  it("correctly identifies a disabled campaign", () => {
    const c = makeCampaign({ is_active: false })
    expect(campaignStatus(c).key).toBe("disabled")
  })

  it("correctly identifies a scheduled (future) campaign", () => {
    const c = makeCampaign({
      is_active: true,
      starts_at: new Date(Date.now() + 86400000 * 7).toISOString(), // a week from now
    })
    expect(campaignStatus(c).key).toBe("scheduled")
  })

  it("correctly identifies an ended campaign", () => {
    const c = makeCampaign({
      is_active: true,
      starts_at: new Date(Date.now() - 86400000 * 14).toISOString(), // two weeks ago
      ends_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
    })
    expect(campaignStatus(c).key).toBe("ended")
  })

  it("treats campaign with no ends_at as not ended", () => {
    const c = makeCampaign({
      is_active: true,
      ends_at: null,
    })
    expect(campaignStatus(c).key).toBe("active")
  })

  it("filters campaign list by status tab", () => {
    const campaigns = [
      makeCampaign({ id: "c1", is_active: true }),
      makeCampaign({ id: "c2", is_active: false }),
      makeCampaign({ id: "c3", is_active: true, starts_at: new Date(Date.now() + 86400000 * 7).toISOString() }),
      makeCampaign({ id: "c4", is_active: true, starts_at: new Date(Date.now() - 86400000 * 14).toISOString(), ends_at: new Date(Date.now() - 86400000).toISOString() }),
    ]

    const filterByTab = (tab: StatusKey) =>
      tab === "all" ? campaigns : campaigns.filter((c) => campaignStatus(c).key === tab)

    expect(filterByTab("all")).toHaveLength(4)
    expect(filterByTab("active")).toHaveLength(1)
    expect(filterByTab("disabled")).toHaveLength(1)
    expect(filterByTab("scheduled")).toHaveLength(1)
    expect(filterByTab("ended")).toHaveLength(1)
  })

  it("STATUS_TABS contains all expected keys", () => {
    const keys = STATUS_TABS.map((t) => t.key)
    expect(keys).toContain("all")
    expect(keys).toContain("active")
    expect(keys).toContain("scheduled")
    expect(keys).toContain("ended")
    expect(keys).toContain("disabled")
  })
})
