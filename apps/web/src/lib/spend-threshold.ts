/**
 * 滿額優惠的文案與進度 —— 跑馬燈、商品頁、購物車共用同一份資料
 * （GET /config 的 spendThresholds 滿額折扣 + spendGifts 滿額贈），不寫死金額。
 * 後台改門檻、改折抵金額、換贈品，三個地方一起變。
 *
 * 結帳時「滿額折扣」同類只套用達到的最高一檔（campaigns-evaluator 的
 * pickBestPerType），滿額贈是另一個類型，會跟折扣疊加。所以這裡把兩者混在同一條
 * 階梯上講（客人眼中就是一條由低到高的門檻），但購物車只說「下一個門檻還差多少」，
 * 不去加總金額。
 */

/**
 * 滿額優惠文案前面的活動標語。跑馬燈與商品頁共用，改這一行兩邊一起變。
 * 想換季節主題（例：🎄 聖誕小禮）就改這裡。
 */
export const SPEND_HEADLINE = "滿額好禮"

/**
 * 買 X 送 Y 活動（GET /config 的 buyGetOffers）。跟滿額優惠分開講 —— 它不是
 * 「買到多少錢」而是「湊到幾件」，混在同一條階梯上客人會以為也是金額門檻。
 *
 * repeats / freeRule 是 2026-10-11 加的，舊版 API 不會回傳 —— 部署先後順序不同時
 * 前台可能先上線，所以兩個都可選，沒拿到就當「不重複、免最便宜的」，跟 bundle
 * 一樣保守。講少了客人只是少知道一件事，講多了（說可以重複但其實不行）會變成
 * 結帳時金額對不上。
 */
export type BuyGetOffer = {
  label: string
  buyQty: number
  getQty: number
  /** true = 湊兩組免兩件（buy_x_get_y）；false/未給 = 整筆訂單只免一次（bundle） */
  repeats?: boolean
  /** 免費的是最便宜還是最貴的那幾件 */
  freeRule?: "lowest_price" | "highest_price"
}

function validOffers(offers: BuyGetOffer[]): BuyGetOffer[] {
  return offers.filter((o) => o.label && o.buyQty > 0 && o.getQty > 0)
}

/**
 * 把名稱裡自己就寫了的「買N送M」拿掉。
 *
 * 2026-10-13：店主把活動取名「蛋白粉任選買10送1」，跑馬燈就變成
 * 「蛋白粉任選買10送1買10送1」—— 文案是 `${label}買${buyQty}送${getQty}`，
 * 名稱裡已經有一次了。
 *
 * 是「拿掉再重接」而不是「有就直接用名稱」：名稱是人打的，件數是結帳真正會算的
 * 那個數字。兩邊不一致時（名稱寫買10送1、設定其實是買5送1），直接用名稱等於
 * 在跑馬燈上給客人一個系統不會兌現的承諾。重接之後數字永遠跟著設定走。
 */
function stripBuyGet(label: string): string {
  return (
    label
      // 連著括號一起拿掉，不然「蛋白粉任選（買10送1）」會剩下一對空括號
      .replace(/[（(［\[【]\s*買\s*\d+\s*送\s*\d+\s*[）)］\]】]/g, "")
      .replace(/買\s*\d+\s*送\s*\d+/g, "")
      // 剩下的空括號、句尾的標點都收掉
      .replace(/[（(［\[【]\s*[）)］\]】]/g, "")
      .replace(/^[\s,、，]+|[（(［\[【\s,、，]+$/g, "")
      .trim()
  )
}

/** 「300克夾鏈袋買10送1」、「全館任選買10送1」。跑馬燈用的短句。 */
export function buyGetMessages(offers: BuyGetOffer[] = []): string[] {
  return validOffers(offers).map((o) => {
    const name = stripBuyGet(o.label)
    return `${name}買${o.buyQty}送${o.getQty}`
  })
}

/**
 * 商品頁用的第二行：把「幾件才成立、免的是哪一件」講清楚。
 *
 * 「買10送1」對單一商品很直覺，對全館任選就不是 —— 湊的是 11 件（付 10 件的錢），
 * 而且 evaluator 免掉的是**最便宜**的那一件。不講的話，客人會以為免的是最貴的，
 * 結帳才發現少折很多；這是客服爭議，不是小事。
 */
export function buyGetDetailLines(offers: BuyGetOffer[] = []): string[] {
  return validOffers(offers).map((o) => {
    const total = o.buyQty + o.getQty
    const which = o.freeRule === "highest_price" ? "最高價" : "最低價"
    return o.repeats
      ? `每湊滿 ${total} 件，${which} ${o.getQty} 件免費`
      : `任選 ${total} 件，${which} ${o.getQty} 件免費（每筆訂單 1 次）`
  })
}

/** 首購折扣（GET /config 的 firstPurchase）。 */
export type FirstPurchase = { discount: number; minOrder: number }

/**
 * 跑馬燈用：「會員首購折50元」。
 *
 * 2026-10-07 店主指定改短，不在這裡講滿額門檻 —— 跑馬燈一格只有幾個字的停留
 * 時間，條件講不清楚反而更容易誤會。門檻還是會講，但講在商品頁價格下方，而且
 * 只對「買一件也湊不到門檻」的商品講（見 firstPurchaseProductMessage）。
 */
export function firstPurchaseMessage(fp: FirstPurchase | null | undefined): string | null {
  if (!fp || fp.discount <= 0) return null
  return `會員首購折${fp.discount}元`
}

/**
 * 商品頁價格下方那一行。這裡不講「滿 300」—— 商品本身的價格就過門檻時，多寫一個
 * 條件只會讓人以為還要再湊；只有這個商品買一件也達不到門檻（例如 75 元的單包）
 * 才要把門檻講出來，不然客人會在結帳頁才發現折不了。
 *
 * minPrice 是這個商品最便宜的規格，傳 undefined 代表不知道價格，一律講門檻。
 *
 * withScoop 只有夾鏈袋商品頁會傳 true（由伺服器端比對贈勺的 slug 清單決定）。
 * 隨身包不送勺，在隨身包頁講會變成講不出理由的差別待遇。
 */
export function firstPurchaseProductMessage(
  fp: FirstPurchase | null | undefined,
  minPrice?: number,
  withScoop = false,
): string | null {
  if (!fp || fp.discount <= 0) return null
  const reachable = fp.minOrder <= 0 || (minPrice != null && minPrice >= fp.minOrder)
  const base = reachable
    ? `加入會員，首次購買結帳自動折 ${fp.discount}元`
    : `加入會員，首次購買滿 ${fp.minOrder}元結帳自動折 ${fp.discount}元`
  return withScoop ? `${base}，並送不鏽鋼量匙 1支` : base
}

export type SpendThreshold = { minAmount: number; discount: number }
export type SpendGift = { minOrder: number; giftName: string; qty?: number }

/** 階梯上的一格：滿 minAmount 可得 reward（「折 100」或「送 帆布環保袋 (大)」）。 */
export type SpendTier = { minAmount: number; reward: string; short: string }

/**
 * 贈品名稱在文案裡要短，但**要講口味**（2026-10-09 店主指定改的）。
 *   「銀杏水蜜桃 – 50克隨身包」→「銀杏水蜜桃 50克隨身包」
 *   「誠真生活禮袋．帆布環保袋 (大)」→「帆布環保袋 (大)」
 * 破折號前面放口味是商品命名的慣例，這裡只是把破折號換成空格。
 *
 * 原本刻意不講口味，怕變成對客人的承諾；現在滿額贈設定的就是指定口味的那個
 * 變體（活動裡存的是該口味的 SKU），講出來才跟實際出貨一致。**反過來說，
 * 日後如果把贈品改成「出貨時看庫存決定口味」，這裡要一起改回去**，否則文案
 * 會承諾一個不保證拿得到的口味。
 */
function shortGiftName(name: string): string {
  return name
    .replace(/^誠真生活禮袋．/, "")
    .replace(/\s*[–—]\s*/g, " ")
    .trim()
}

/**
 * 送一份以上時要把數量講出來 ——「滿1800送50克隨身包」看起來跟送一包沒兩樣，
 * 客人結帳拿到兩包才發現，等於白白少掉一次「比預期多」的機會。
 * 單位由品名決定：夾鏈袋論袋，其餘論包。送一份時不加（「送50克隨身包1包」很囉嗦）。
 */
function giftQtySuffix(name: string, qty: number | undefined): string {
  if (!qty || qty <= 1) return ""
  return `${qty}${name.includes("袋") ? "袋" : "包"}`
}

/** 折扣 + 贈品合成一條由低到高的階梯。 */
export function spendTiers(thresholds: SpendThreshold[], gifts: SpendGift[] = []): SpendTier[] {
  const fromDiscounts = thresholds
    .filter((t) => t.minAmount > 0 && t.discount > 0)
    .map((t) => ({ minAmount: t.minAmount, reward: `折 ${t.discount}`, short: `折${t.discount}` }))
  const fromGifts = gifts
    .filter((g) => g.minOrder > 0 && g.giftName)
    .map((g) => {
      const name = shortGiftName(g.giftName)
      const suffix = giftQtySuffix(name, g.qty)
      return {
        minAmount: g.minOrder,
        reward: `送 ${name}${suffix}`,
        short: `送${name}${suffix}`,
      }
    })
  return [...fromDiscounts, ...fromGifts].sort((a, b) => a.minAmount - b.minAmount)
}

/** 跑馬燈／商品頁：一句話講完全部門檻。例：「滿2400送帆布環保袋 (大)、滿3600折200」 */
export function marqueeSpendMessage(
  thresholds: SpendThreshold[],
  gifts: SpendGift[] = [],
): string | null {
  const tiers = spendTiers(thresholds, gifts)
  if (tiers.length === 0) return null
  return tiers.map((t) => `滿${t.minAmount}${t.short}`).join("、")
}

export type SpendProgress = {
  /** 已達到的最高一格；一格都沒達到時為 null。 */
  current: SpendTier | null
  /** 下一格；已是最高一格時為 null。 */
  next: SpendTier | null
  /** 距離下一格還差多少；沒有下一格時為 0。 */
  remaining: number
  /** 往下一格的進度百分比（0–100）；已是最高一格時為 100。 */
  pct: number
}

export function spendProgress(
  subtotal: number,
  thresholds: SpendThreshold[],
  gifts: SpendGift[] = [],
): SpendProgress | null {
  const tiers = spendTiers(thresholds, gifts)
  if (tiers.length === 0) return null
  const current = [...tiers].reverse().find((x) => subtotal >= x.minAmount) ?? null
  const next = tiers.find((x) => subtotal < x.minAmount) ?? null
  if (!next) return { current, next: null, remaining: 0, pct: 100 }
  const remaining = next.minAmount - subtotal
  const pct = Math.max(0, Math.min(100, Math.round((subtotal / next.minAmount) * 100)))
  return { current, next, remaining, pct }
}
