import { Router } from "express"
import { getShippingRule } from "../lib/shipping"
import { supabase } from "../lib/supabase"
import { getSetting } from "../lib/settings"
import { loadScoopGiftConfig } from "../lib/scoop-gift"
import { mapBuyGetOffers, type BuyGetOffer } from "../lib/buy-get-offers"
import {
  HIDE_SPEND_GIFT_PROMO_SLUGS,
  THRESHOLD_EXCLUDED_SLUGS,
  unadvertisableProductIds,
} from "../lib/threshold-exclusions"

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
      // 綁優惠碼的免運（例如得獎禮那張）不是對所有人說的話，不能上跑馬燈。
      .is("coupon_id", null)
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
  // 每一個對外宣傳中的滿額檔次，各自的排除清單。用來算出「哪些商品頁不該印
  // 滿額好禮」—— 見 unadvertisableProductIds。
  const tierExclusions: string[][] = []
  const collectExclusions = (cfg: Record<string, unknown>) => {
    tierExclusions.push(
      Array.isArray(cfg.excluded_product_ids)
        ? (cfg.excluded_product_ids as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    )
  }

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
        collectExclusions(cfg)
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
  // items：一檔活動可以送多種贈品（1111 滿 3,000 送原味 1 包 + 銀杏水蜜桃 1 包）。
  // giftName／qty 留著是為了相容 —— 舊的前端只讀這兩個欄位，拿第一項仍然講得通。
  let spendGifts: Array<{
    minOrder: number
    giftName: string
    qty: number
    items: Array<{ name: string; qty: number }>
  }> = []
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
        collectExclusions(cfg)
        const raw = Array.isArray(cfg.gifts)
          ? (cfg.gifts as unknown[])
          : [{ name: cfg.gift_name, qty: cfg.gift_qty }]
        const items = raw
          .map((g) => {
            const o = (g ?? {}) as Record<string, unknown>
            return {
              name: String(o.name ?? "").trim(),
              // 數量要跟著走：送兩包的活動，文案不講數量就等於只承諾一包。
              qty: Number(o.qty ?? 1),
            }
          })
          .filter((g) => g.name && g.qty > 0)
        return {
          minOrder: Number(cfg.min_order_amount ?? 0),
          giftName: items[0]?.name ?? "",
          qty: items[0]?.qty ?? 1,
          items,
        }
      })
      .filter((g) => g.minOrder > 0 && g.items.length > 0)
      .sort((a, b) => a.minOrder - b.minOrder)
  } catch (err) {
    console.warn("[config] freebie campaign lookup failed (non-fatal):", err)
  }

  // 買 X 送 Y：跟滿額優惠一樣要講給客人聽，不然客人只有在湊滿 11 袋結帳時才會
  // 發現有折扣 —— 這種活動的重點正是「先知道才會湊」。
  // 只收所有人都適用的（沒綁等級、沒綁折扣碼）。
  //
  // 兩種 type 都收：
  //   buy_x_get_y —— 可重複，湊兩組就免兩件（max_uses_per_order 為上限）
  //   bundle      —— 一次性，整張訂單只免最便宜的 getQty 件一次
  // 整理成文案形狀的規則（label、件數欄位、能不能重複）在 mapBuyGetOffers，有測試。
  let buyGetOffers: BuyGetOffer[] = []
  try {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from("campaigns")
      .select("name, type, config, starts_at, ends_at, tier_id, coupon_id")
      .in("type", ["buy_x_get_y", "bundle"])
      .eq("is_active", true)
      .is("tier_id", null)
      .is("coupon_id", null)
      .lte("starts_at", now)
    buyGetOffers = mapBuyGetOffers(data ?? [], now)
  } catch (err) {
    console.warn("[config] buy_x_get_y / bundle campaign lookup failed (non-fatal):", err)
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

  // 哪些商品頁不該印「滿額好禮」。三種來源：
  //   1. 被每一個宣傳中的檔次都排除的商品（1111 限時組合）—— 印了就是做不到的承諾
  //   2. 不列入門檻的商品（湯匙加購品）—— 同上
  //   3. 店主指定不要印的（銀杏水蜜桃 50克）—— 它拿得到，只是不在自己的頁面上宣傳
  // 前兩種是「拿不到」，第三種是「拿得到但不講」，金額上完全不同，只是剛好共用
  // 同一個前端開關。
  let noSpendGiftProductIds: string[] = []
  try {
    const ids = new Set(unadvertisableProductIds(tierExclusions))
    const { data: excludedBySlug } = await supabase
      .from("products")
      .select("id")
      .in("slug", [...THRESHOLD_EXCLUDED_SLUGS, ...HIDE_SPEND_GIFT_PROMO_SLUGS])
    for (const row of (excludedBySlug ?? []) as Array<{ id: string }>) ids.add(row.id)
    noSpendGiftProductIds = [...ids]
  } catch (err) {
    console.warn("[config] 滿額好禮排除清單讀取失敗（非致命）:", err)
  }

  // GA4 的評估 ID。放在公開的 /config 是刻意的 —— 它本來就會出現在每一頁的
  // 原始碼裡，不是秘密。讓前台從這裡讀，店主就能在後台改 ID，
  // 不必動 Vercel 的環境變數（那是建置時烘進去的，改了要重新部署）。
  let ga4MeasurementId: string | null = null
  try {
    const raw = (await getSetting("analytics.ga4_measurement_id"))?.trim()
    ga4MeasurementId = raw && /^G-[A-Z0-9]+$/i.test(raw) ? raw.toUpperCase() : null
  } catch (err) {
    console.warn("[config] GA4 設定讀取失敗（非致命）:", err)
  }

  res.json({
    allowTestPaid: process.env.ALLOW_NON_ADMIN_TEST_PAID === "true",
    ga4MeasurementId,
    shipping,
    shippingCampaigns,
    spendThresholds,
    spendGifts,
    noSpendGiftProductIds,
    buyGetOffers,
    firstPurchase,
    scoopGift,
  })
})
