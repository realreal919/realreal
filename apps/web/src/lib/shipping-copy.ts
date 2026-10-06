/**
 * 免運門檻的文案，只在這裡算一次。
 *
 * 這個檔案存在的原因是同一個 bug 犯了兩次。跑馬燈原本寫死「649 / 999」，後台
 * 實際設定是 650 / 1000，於是剛好 999 元的宅配客人被承諾免運、結帳被收 150。
 * 修好跑馬燈之後，FAQ 裡同一句話仍然寫死著 649 —— 因為那是另一個檔案，沒人
 * 想到它也在講同一件事。
 *
 * 後台改一個數字，兩個地方要一起變，唯一可靠的辦法是它們讀同一份資料、走同一
 * 段分組邏輯。文案語氣各自保留（跑馬燈講「999元」，FAQ 講「NT$999」），但
 * 「哪幾種寄送方式共用同一個門檻」這件事只有這裡說了算。
 */
import { API_URL } from "./api-url"

export type ShippingConfig = {
  cvs: { fee: number; free_threshold: number }
  cvsCod: { fee: number; free_threshold: number }
  home: { fee: number; free_threshold: number }
}

export type FreeShippingGroup = {
  threshold: number
  labels: string[]
  /** 三種寄送方式門檻都一樣 —— 講「全站」，不要把同一件事拆成三句。 */
  coversEveryMethod: boolean
}

/** 目前生效中的免運活動（跟常態門檻不同，可限定星期與取貨方式）。 */
export type ShippingCampaign = {
  minOrder: number
  buckets: string[]
  weekdays: number[]
}

export async function fetchShippingConfig(): Promise<ShippingConfig | null> {
  try {
    const res = await fetch(`${API_URL}/config`, { cache: "no-store" })
    if (!res.ok) return null
    const json = (await res.json()) as { shipping?: ShippingConfig | null }
    return json.shipping ?? null
  } catch {
    // 拿不到就回 null，呼叫端會省略免運那句話。短一點的文案沒關係，錯的數字不行。
    return null
  }
}

export function freeShippingGroups(s: ShippingConfig | null): FreeShippingGroup[] {
  if (!s) return []

  const methods = [
    { label: "超商取貨", threshold: s.cvs.free_threshold },
    { label: "超商取貨付款", threshold: s.cvsCod.free_threshold },
    { label: "宅配", threshold: s.home.free_threshold },
  ]

  // 依門檻分組，維持門檻第一次出現的順序。
  const groups = new Map<number, string[]>()
  for (const m of methods) {
    const bucket = groups.get(m.threshold)
    if (bucket) bucket.push(m.label)
    else groups.set(m.threshold, [m.label])
  }

  return Array.from(groups.entries()).map(([threshold, labels]) => ({
    threshold,
    labels,
    coversEveryMethod: labels.length === methods.length,
  }))
}

/** 跑馬燈用：短句，口語的「元」。 */
export function marqueeShippingMessages(s: ShippingConfig | null): string[] {
  return freeShippingGroups(s).map((g) =>
    g.coversEveryMethod
      ? `全站消費滿${g.threshold}元免運`
      : `${g.labels.join("、")}滿${g.threshold}元免運`,
  )
}

/** FAQ「運費如何計算？」的完整答案，含各方式運費與免運門檻。 */
export function shippingFeeAnswer(s: ShippingConfig | null): string {
  const overseas = "港澳寄送採順豐速運，運費到付，不適用滿額免運活動。"
  if (!s) return overseas

  const fees =
    `宅配運費 NT$${s.home.fee}，` +
    `超商取貨運費 NT$${s.cvs.fee}，` +
    `超商取貨付款運費 NT$${s.cvsCod.fee}。`

  const free = freeShippingGroups(s)
    .map((g) =>
      g.coversEveryMethod
        ? `全站消費滿 NT$${g.threshold} 免運。`
        : `消費滿 NT$${g.threshold} ${g.labels.join("、")}免運。`,
    )
    .join("")

  return `${fees}${free}${overseas}`
}

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"]
const BUCKET_NAMES: Record<string, string> = {
  cvs: "超商取貨",
  cvsCod: "超商取貨付款",
  home: "宅配",
}

/**
 * 「超商取貨」與「超商取貨付款」在客人眼裡是同一件事的兩種付法，所以活動只給
 * 前者時一定要講清楚，否則選了取貨付款的人結帳被收運費才發現。
 *
 * 只在「有超商取貨、但不含取貨付款」時才加註記 —— 兩者都涵蓋時寫成
 * 「超商取貨(非取貨付款)、超商取貨付款」會自相矛盾。
 */
function bucketLabels(buckets: string[]): string {
  const hasCvs = buckets.includes("cvs")
  const hasCvsCod = buckets.includes("cvsCod")
  // 兩種超商取貨都適用 → 就說「超商取貨」，不必把同一件事拆成兩句
  // （2026-09-29 週六免運改成含取貨付款後，原本會寫成「超商取貨、超商取貨付款」）。
  if (hasCvs && hasCvsCod) {
    const rest = buckets.filter((b) => b !== "cvs" && b !== "cvsCod").map((b) => BUCKET_NAMES[b] ?? b)
    return ["超商取貨", ...rest].join("、")
  }
  return buckets
    .map((b) =>
      b === "cvs" ? "超商取貨(非取貨付款)" : (BUCKET_NAMES[b] ?? b),
    )
    .join("、")
}

/**
 * 免運活動的跑馬燈文案，由活動條件產生，不寫死。
 *
 * 常態門檻那句寫死過一次（649/999 對不上後台實際設定，害客人在 999 被收運費），
 * 這裡不重蹈覆轍：後台改門檻、改星期、改適用取貨方式，這句話自己跟著變。
 *
 * 例：{ minOrder: 666, buckets: ["cvs"], weekdays: [6] }
 *     → 「週六超商取貨滿666元免運」
 */
export function campaignShippingMessages(campaigns: ShippingCampaign[]): string[] {
  return campaigns
    .filter((c) => c.minOrder > 0)
    .map((c) => {
      const days =
        c.weekdays.length > 0 && c.weekdays.length < 7
          ? `週${c.weekdays.map((d) => WEEKDAY_NAMES[d] ?? "").join("、")}`
          : ""
      const methods = c.buckets.length > 0 ? bucketLabels(c.buckets) : "全站"
      return `${days}${methods}滿${c.minOrder}元免運`
    })
}

export type CartFreeShippingHint = {
  /** 已達這一組的門檻 */
  reached: boolean
  /** 還差多少 */
  remaining: number
  /** 進度條百分比 */
  pct: number
  /** 門檻最低的那一組門檻金額 */
  threshold: number
  /** 三種寄送方式門檻一致時為 null，不一致時是「超商取貨」這類說明 */
  methods: string | null
}

/**
 * 購物車的免運提示：講「最快能免運的那一組」，而且一定要講清楚是哪一種寄送方式。
 *
 * 原本這條是拿「宅配」的試算門檻在講，三種方式都同一個數字時怎麼寫都對。
 * 2026-10-06 超商降到 999、宅配留在 1300 之後就不一樣了：900 元的購物車會被
 * 告知「再加 400 就免運」，但他選超商其實只差 99 —— 數字沒錯，卻把人推離結帳。
 *
 * 當天有免運活動（例如週六超商滿 666）時，活動門檻比常態低就以活動為準，
 * 不然週六的提示會比實際要求的還高。
 */
export function cartFreeShippingHint(
  s: ShippingConfig | null,
  subtotal: number,
  campaigns: ShippingCampaign[] = [],
  now: Date = new Date(),
): CartFreeShippingHint | null {
  if (!s) return null

  const thresholds: Record<string, number> = {
    cvs: s.cvs.free_threshold,
    cvsCod: s.cvsCod.free_threshold,
    home: s.home.free_threshold,
  }
  const keys = Object.keys(thresholds)

  for (const c of campaigns) {
    if (c.minOrder <= 0) continue
    if (c.weekdays.length > 0 && !c.weekdays.includes(now.getDay())) continue
    const buckets = c.buckets.length > 0 ? c.buckets : keys
    for (const b of buckets) {
      if (!(b in thresholds)) continue
      // 門檻 0 代表「這個方式不提供免運」，活動不該把它變成有免運。
      if (thresholds[b] <= 0) continue
      thresholds[b] = Math.min(thresholds[b], c.minOrder)
    }
  }

  const usable = keys.filter((k) => thresholds[k] > 0)
  if (usable.length === 0) return null

  const threshold = Math.min(...usable.map((k) => thresholds[k]))
  const group = usable.filter((k) => thresholds[k] === threshold)
  const coversEveryMethod = group.length === keys.length

  return {
    reached: subtotal >= threshold,
    remaining: Math.max(0, threshold - subtotal),
    pct: Math.min(100, Math.round((subtotal / threshold) * 100)),
    threshold,
    methods: coversEveryMethod ? null : bucketLabels(group),
  }
}
