import { Router } from "express"
import { getShippingRule } from "../lib/shipping"
import { supabase } from "../lib/supabase"
import { getSetting } from "../lib/settings"
import { loadScoopGiftConfig } from "../lib/scoop-gift"

export const configRouter = Router()

// GET /config — public, non-sensitive storefront runtime flags.
//
// `allowTestPaid` mirrors the server-side gate (ALLOW_NON_ADMIN_TEST_PAID) that
// POST /orders enforces, so the checkout UI can show the sandbox "test_paid"
// option iff the server will actually accept it from a non-admin. Read here at
// runtime (server process.env) — deliberately NOT a NEXT_PUBLIC build-time flag,
// because that has to be inlined at build and is easy to get wrong / forget.
//
// ⚠️ test_paid marks an order paid WITHOUT real payment. Removing the single
// Railway env ALLOW_NON_ADMIN_TEST_PAID before go-live both hides the button
// (this flag flips to false) and makes the server reject it — atomic.
configRouter.get("/", async (_req, res) => {
  // Free-shipping thresholds, read live from the same getShippingRule() the
  // checkout math uses. Exposed so storefront copy (marquee, FAQ, checkout
  // hints) can print the REAL numbers instead of hardcoded ones.
  //
  // Why: the marquee said 649 / 999 while the settings actually held 650 /
  // 1000, so a customer at exactly 999 on 宅配 was promised free shipping and
  // charged NT$150. Hardcoded copy drifts silently every time the thresholds
  // are edited in admin; reading them here means it cannot drift again.
  //
  // Non-fatal: a settings hiccup must never break the storefront shell, so a
  // failure returns nulls and the caller falls back to omitting the numbers.
  let shipping: {
    cvs: { fee: number; free_threshold: number }
    cvsCod: { fee: number; free_threshold: number }
    home: { fee: number; free_threshold: number }
  } | null = null
  try {
    const [cvs, cvsCod, home] = await Promise.all([
      getShippingRule("cvs_711"),
      getShippingRule("cvs_711", "cvs_cod"),
      getShippingRule("home_delivery"),
    ])
    shipping = { cvs, cvsCod, home }
  } catch (err) {
    console.warn("[config] shipping rule lookup failed (non-fatal):", err)
  }

  // 目前生效中的免運「活動」（跟上面的常態門檻不同）。
  //
  // 例：週六限定、超商取貨滿 666 免運。跑馬燈要能講這件事，但**不能寫死** ——
  // 常態門檻寫死的那句已經出過兩次錯（649/999 對不上實際設定）。這裡把活動的
  // 條件原樣送出去，文案由前端依條件組出來，後台改門檻或星期就自己跟著變。
  //
  // 只送條件、不送任何內部識別，是公開端點該有的樣子。
  let shippingCampaigns: Array<{
    minOrder: number
    buckets: string[]
    weekdays: number[]
  }> = []
  try {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from("campaigns")
      .select("config, starts_at, ends_at")
      .eq("type", "free_shipping")
      .eq("is_active", true)
      .lte("starts_at", now)
    shippingCampaigns = (data ?? [])
      .filter((c) => !c.ends_at || (c.ends_at as string) > now)
      .map((c) => {
        const cfg = (c.config ?? {}) as Record<string, unknown>
        return {
          minOrder: Number(cfg.min_order_amount ?? 0),
          buckets: Array.isArray(cfg.shipping_buckets)
            ? (cfg.shipping_buckets as unknown[]).map(String)
            : [],
          weekdays: Array.isArray(cfg.active_weekdays)
            ? (cfg.active_weekdays as unknown[]).map(Number)
            : [],
        }
      })
      .filter((c) => c.minOrder > 0)
  } catch (err) {
    console.warn("[config] free-shipping campaign lookup failed (non-fatal):", err)
  }

  // 生效中的滿額折扣（spend_threshold），給跑馬燈與購物車「再買 NT$X 折 Y」用。
  // 跟免運活動同一個理由：文案由條件組出來，不寫死，後台改金額就自己跟著變。
  // 限定等級的活動不放進來 —— 這裡是對所有訪客說的話，不能承諾他拿不到的折扣。
  let spendThresholds: Array<{ minAmount: number; discount: number }> = []
  try {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from("campaigns")
      .select("config, starts_at, ends_at, tier_id")
      .eq("type", "spend_threshold")
      .eq("is_active", true)
      .is("tier_id", null)
      .lte("starts_at", now)
    spendThresholds = (data ?? [])
      .filter((c) => !c.ends_at || (c.ends_at as string) > now)
      .map((c) => {
        const cfg = (c.config ?? {}) as Record<string, unknown>
        return { minAmount: Number(cfg.min_amount ?? 0), discount: Number(cfg.discount_amount ?? 0) }
      })
      .filter((t) => t.minAmount > 0 && t.discount > 0)
      .sort((a, b) => a.minAmount - b.minAmount)
  } catch (err) {
    console.warn("[config] spend-threshold campaign lookup failed (non-fatal):", err)
  }

  // 滿額贈（freebie）：跟滿額折扣一起講給客人聽。
  // 只收「所有人、不用輸入折扣碼」的 —— 綁 coupon_id 的活動（例：ZUMBA100 送隨身包）
  // 是輸入代碼才有的，放進全站文案會變成對所有人的承諾。
  let spendGifts: Array<{ minOrder: number; giftName: string; qty: number }> = []
  try {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from("campaigns")
      .select("config, starts_at, ends_at, tier_id, coupon_id")
      .eq("type", "freebie")
      .eq("is_active", true)
      .is("tier_id", null)
      .is("coupon_id", null)
      .lte("starts_at", now)
    spendGifts = (data ?? [])
      .filter((c) => !c.ends_at || (c.ends_at as string) > now)
      .map((c) => {
        const cfg = (c.config ?? {}) as Record<string, unknown>
        return {
          minOrder: Number(cfg.min_order_amount ?? 0),
          giftName: String(cfg.gift_name ?? "").trim(),
          // 數量要跟著走：送兩包的活動，文案不講數量就等於只承諾一包。
          qty: Number(cfg.gift_qty ?? 1),
        }
      })
      .filter((g) => g.minOrder > 0 && g.giftName)
      .sort((a, b) => a.minOrder - b.minOrder)
  } catch (err) {
    console.warn("[config] freebie campaign lookup failed (non-fatal):", err)
  }

  // 買 X 送 Y（buy_x_get_y）：跟滿額優惠一樣要講給客人聽，不然客人只有在湊滿
  // 11 袋結帳時才會發現有折扣 —— 這種活動的重點正是「先知道才會湊」。
  // 只收所有人都適用的（沒綁等級、沒綁折扣碼）。
  let buyGetOffers: Array<{ label: string; buyQty: number; getQty: number }> = []
  try {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from("campaigns")
      .select("name, config, starts_at, ends_at, tier_id, coupon_id")
      .eq("type", "buy_x_get_y")
      .eq("is_active", true)
      .is("tier_id", null)
      .is("coupon_id", null)
      .lte("starts_at", now)
    buyGetOffers = (data ?? [])
      .filter((c) => !c.ends_at || (c.ends_at as string) > now)
      .map((c) => {
        const cfg = (c.config ?? {}) as Record<string, unknown>
        return {
          // copy_label 是給客人看的短名（「300克夾鏈袋」）。沒設就退回活動名稱，
          // 至少不會是空白。
          label: String(cfg.copy_label ?? c.name ?? "").trim(),
          buyQty: Number(cfg.buy_quantity ?? 0),
          getQty: Number(cfg.get_quantity ?? 0),
        }
      })
      .filter((o) => o.label && o.buyQty > 0 && o.getQty > 0)
  } catch (err) {
    console.warn("[config] buy_x_get_y campaign lookup failed (non-fatal):", err)
  }

  // 首購折扣：跑馬燈要把「折多少、滿多少可用」講清楚。寫死在前端的話，
  // 每次調門檻都要改程式再部署一次（2026-10 就從 350 改成 300）。
  let firstPurchase: { discount: number; minOrder: number } | null = null
  try {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from("campaigns")
      .select("config, starts_at, ends_at")
      .eq("type", "first_purchase")
      .eq("is_active", true)
      .lte("starts_at", now)
      .limit(1)
    const row = (data ?? []).filter((c) => !c.ends_at || (c.ends_at as string) > now)[0]
    if (row) {
      const cfg = (row.config ?? {}) as Record<string, unknown>
      const discount = Number(cfg.discount_amount ?? 0)
      if (discount > 0) {
        firstPurchase = { discount, minOrder: Number(cfg.min_order_amount ?? 0) }
      }
    }
  } catch (err) {
    console.warn("[config] first_purchase campaign lookup failed (non-fatal):", err)
  }

  // 贈勺規則。前台的夾鏈袋商品頁要據此顯示「可加購量匙」的引導，所以夾鏈袋的
  // 清單只能有一份來源 —— 後端判斷送不送、前台判斷要不要提示，兩邊各寫一份
  // slug 清單的話，改了一邊另一邊照舊，提示和實際贈送就會對不上。
  let scoopGift: {
    slug: string
    triggerSlugs: string[]
    addonPrice: number | null
  } | null = null
  try {
    const cfg = await loadScoopGiftConfig(getSetting)

    // 加購價以「商品上實際設定的那個數字」為準，而不是設定表的值。
    // 前台顯示的價格必須等於結帳真正收的錢；兩者來源不同的話，後台改了商品
    // 卻忘了改設定（或反過來），客人就會看到一個付不到的價格。設定表只在
    // 商品查不到時當備援。
    const { data: giftRow } = await supabase
      .from("products")
      .select("product_variants(addon_price)")
      .eq("slug", cfg.giftSlug)
      .maybeSingle()
    const variantPrice = Number(
      (giftRow as { product_variants?: Array<{ addon_price: number | string | null }> } | null)
        ?.product_variants?.find((v) => v.addon_price != null)?.addon_price,
    )
    const settingPrice = Number(await getSetting("membership.scoop_addon_price"))
    const price = Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : settingPrice

    scoopGift = {
      slug: cfg.giftSlug,
      triggerSlugs: cfg.triggerSlugs,
      addonPrice: Number.isFinite(price) && price > 0 ? price : null,
    }
  } catch (err) {
    console.warn("[config] scoop gift lookup failed (non-fatal):", err)
  }

  res.json({
    allowTestPaid: process.env.ALLOW_NON_ADMIN_TEST_PAID === "true",
    shipping,
    shippingCampaigns,
    spendThresholds,
    spendGifts,
    buyGetOffers,
    firstPurchase,
    scoopGift,
  })
})
