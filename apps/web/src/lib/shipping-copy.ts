/**
 * 免運門檻的文案，只在這裡算一次。
 *
 * 這個檔案存在的原因是同一個 bug 犯了兩次。跑馬燈原本寫死「649 / 999」，後台
 * 實際設定是 650 / 1000，於是剛好 999 元的宅配客人被承諾免運、結帳被收 150。
 * 修好跑馬燈之後，FAQ 裡同一句話仍然寫死著 649 —— 因為那是另一個檔案，沒人
 * 想到它也在講同一件事。
 *
 * 2026-11-26 起 7-11 多了一道階梯（滿 699 運費 40、滿 999 免運，取貨與取貨付款
 * 都算），來源收在 shippingSteps()。跑馬燈把它與免運併成一句（「…滿699元運費
 * 40元．滿999元免運」），FAQ 則各自成句 —— 語氣各自保留，數字同一份來源。
 *
 * 後台改一個數字，兩個地方要一起變，唯一可靠的辦法是它們讀同一份資料、走同一
 * 段分組邏輯。文案語氣各自保留（跑馬燈講「999元」，FAQ 講「NT$999」），但
 * 「哪幾種寄送方式共用同一個門檻」這件事只有這裡說了算。
 */
import { API_URL } from "./api-url"

type Rule = {
  fee: number
  free_threshold: number
  /**
   * 階梯運費：滿 `at` 元起運費降為 `fee` 元（還沒到免運門檻的那一段）。
   * 由低到高。可選 —— 前台可能比 API 早部署，舊版 /config 沒有這個欄位；
   * 拿不到就當作沒有階梯，少講一句比憑空生出一個數字好。
   */
  steps?: Array<{ at: number; fee: number }>
}

/**
 * cvs / cvsCod 指的是 **7-11**。全家從 2026-11-17 起有自己的免運門檻
 * （7-11 899、全家 1500），所以兩家不能再共用同一句文案。
 *
 * cvsFamily / cvsFamilyCod 是可選的：前台可能比 API 早部署，舊版 /config 還
 * 沒有這兩個欄位。拿不到時退回 7-11 的數字 —— 那是這次改動之前的事實，寧可
 * 暫時少講一個差異，也不要憑空生出一個沒人設定過的數字。
 */
export type ShippingConfig = {
  cvs: Rule
  cvsCod: Rule
  cvsFamily?: Rule
  cvsFamilyCod?: Rule
  home: Rule
}

export type ShippingMethodKey = "cvs" | "cvsCod" | "cvsFamily" | "cvsFamilyCod" | "home"

type MethodRow = { key: ShippingMethodKey; label: string; threshold: number }

/**
 * 寄送方式與它們各自的門檻。文案與購物車提示都從這一份長出來。
 *
 * 兩家超商門檻相同時**不分家** —— 講成「7-11 超商取貨、全家超商取貨滿650元
 * 免運」只是把同一個數字說兩次，客人還得自己比對兩句話一不一樣。只有數字真的
 * 不同（2026-11-26 起 7-11 899 / 全家 1500）才拆開，因為那時候不拆就是講錯。
 */
function shippingMethods(s: ShippingConfig): MethodRow[] {
  const family = s.cvsFamily ?? s.cvs
  const familyCod = s.cvsFamilyCod ?? s.cvsCod
  const sameAsSeven =
    family.free_threshold === s.cvs.free_threshold &&
    familyCod.free_threshold === s.cvsCod.free_threshold

  if (sameAsSeven) {
    return [
      { key: "cvs", label: "超商取貨", threshold: s.cvs.free_threshold },
      { key: "cvsCod", label: "超商取貨付款", threshold: s.cvsCod.free_threshold },
      { key: "home", label: "宅配", threshold: s.home.free_threshold },
    ]
  }

  return [
    { key: "cvs", label: "7-11 超商取貨", threshold: s.cvs.free_threshold },
    { key: "cvsCod", label: "7-11 超商取貨付款", threshold: s.cvsCod.free_threshold },
    { key: "cvsFamily", label: "全家超商取貨", threshold: family.free_threshold },
    { key: "cvsFamilyCod", label: "全家超商取貨付款", threshold: familyCod.free_threshold },
    { key: "home", label: "宅配", threshold: s.home.free_threshold },
  ]
}

/**
 * 階梯運費的句子，由 /config 的 steps 長出來。
 *
 * **一定指名 7-11**，不走 shippingMethods() 那套標籤合併。原因：階梯只有
 * 7-11 取貨有（見 apps/api/src/lib/shipping.ts，只有 cvs_711 的非取貨付款
 * 分支讀階梯設定），而標籤合併會在兩家超商門檻相同時把話寫成「超商取貨」
 * —— 那就是對全家的客人承諾一個他沒有的運費。免運門檻可以合併，因為那是
 * 兩家真的一樣；階梯不行，因為它從來只屬於一家。
 */
export type ShippingStep = { label: string; at: number; fee: number }

export function shippingSteps(s: ShippingConfig | null): ShippingStep[] {
  if (!s) return []
  const steps = s.cvs.steps ?? []
  if (steps.length === 0) return []

  // 「7-11 超商取貨」在這裡涵蓋取貨與取貨付款 —— 店主 2026-11-26 指定兩者的階梯
  // 運費都是 40（API 的 cvs 與 cvsCod 都會帶 steps）。曾經加過「非取貨付款」的
  // 註記，那是階梯只給取貨時的事，現在加了就是講錯。
  return steps
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((step) => ({ label: "7-11 超商取貨", at: step.at, fee: step.fee }))
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

  const methods = shippingMethods(s)

  // 依門檻分組，維持門檻第一次出現的順序。
  const groups = new Map<number, string[]>()
  for (const m of methods) {
    const bucket = groups.get(m.threshold)
    if (bucket) bucket.push(m.label)
    else groups.set(m.threshold, [m.label])
  }

  return Array.from(groups.entries()).map(([threshold, labels]) => ({
    threshold,
    labels: collapseCvsLabels(labels),
    coversEveryMethod: labels.length === methods.length,
  }))
}

/**
 * 同一家超商的「取貨」與「取貨付款」同門檻時，寫成那家的名字就好。
 *
 * 並列成「7-11 超商取貨、7-11 超商取貨付款滿666元免運」讀起來像是兩個不同的
 * 條件，而且在跑馬燈那種一瞥而過的介面上特別容易讓人以為「只有取貨付款才算」。
 *
 * 合併只在同一家超商內發生 —— 7-11 與全家的門檻不同，合成一句「超商取貨」
 * 就會變成對其中一家說謊，那正是這次改門檻要避免的事。
 */
const CHAIN_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ["超商取貨", "超商取貨付款", "超商取貨"],
  ["7-11 超商取貨", "7-11 超商取貨付款", "7-11 超商取貨"],
  ["全家超商取貨", "全家超商取貨付款", "全家超商取貨"],
]

function collapseCvsLabels(labels: string[]): string[] {
  const out: string[] = []
  for (const l of labels) {
    const pair = CHAIN_PAIRS.find(([a, b]) => l === a || l === b)
    if (!pair) {
      out.push(l)
      continue
    }
    const [a, b, merged] = pair
    const text = labels.includes(a) && labels.includes(b) ? merged : l
    if (!out.includes(text)) out.push(text)
  }
  return out
}

/**
 * 跑馬燈用：短句，口語的「元」。
 *
 * 7-11 的階梯與免運併成同一句，用「．」分隔：
 *
 *   7-11 超商取貨滿699元運費40元．滿999元免運
 *
 * 店主 2026-11-26 的最終版。中間試過兩句並排、也試過只講免運那句：並排在滾動
 * 的跑馬燈上像兩個互相矛盾的承諾，只講免運則漏掉了 699 那一階。一句講完整道
 * 階梯，客人不必自己把兩句湊起來，也不會只看到其中一半。
 *
 * 併的對象只能是「標籤剛好就是 7-11 的那一組」。階梯只屬於 7-11（見
 * shippingSteps），門檻碰巧跟全家或宅配相同而被分到同一組時就不能併 —— 那會
 * 變成對全家承諾 40 元運費。那種情形讓階梯回去自己一句，寧可多一句也不要講錯。
 */
export function marqueeShippingMessages(s: ShippingConfig | null): string[] {
  const steps = shippingSteps(s)
  const stepClauses = steps.map((t) => `滿${t.at}元運費${t.fee}元`)
  const stepLabel = steps[0]?.label

  // 階梯能不能併進免運那一句：要有階梯，而且那一組的標籤剛好只有 7-11 自己。
  const canMerge = (g: FreeShippingGroup) =>
    stepClauses.length > 0 &&
    !g.coversEveryMethod &&
    g.labels.length === 1 &&
    g.labels[0] === stepLabel

  const free = freeShippingGroups(s)
  const merged = free.some(canMerge)

  const lines = free.map((g) => {
    if (canMerge(g)) {
      return `${g.labels[0]}${stepClauses.join("．")}．滿${g.threshold}元免運`
    }
    return g.coversEveryMethod
      ? `全站消費滿${g.threshold}元免運`
      : `${g.labels.join("、")}滿${g.threshold}元免運`
  })

  // 併不進去的時候，階梯仍然要講 —— 自己一句，排在最前面（金額最低）。
  if (stepClauses.length > 0 && !merged) {
    return [...steps.map((t) => `${t.label}滿${t.at}元運費${t.fee}元`), ...lines]
  }
  return lines
}

/** FAQ「運費如何計算？」的完整答案，含各方式運費與免運門檻。 */
export function shippingFeeAnswer(s: ShippingConfig | null): string {
  const overseas = "港澳寄送採順豐速運，運費到付，不適用滿額免運活動。"
  if (!s) return overseas

  const fees =
    `宅配運費 NT$${s.home.fee}，` +
    `超商取貨運費 NT$${s.cvs.fee}，` +
    `超商取貨付款運費 NT$${s.cvsCod.fee}。`

  // 階梯先講（金額低的在前），再講免運 —— 跟跑馬燈同一個順序，兩個畫面讀起來
  // 才是同一道階梯。
  const steps = shippingSteps(s)
    .map((t) => `${t.label}消費滿 NT$${t.at} 運費 NT$${t.fee}。`)
    .join("")

  const free = freeShippingGroups(s)
    .map((g) =>
      g.coversEveryMethod
        ? `全站消費滿 NT$${g.threshold} 免運。`
        : `消費滿 NT$${g.threshold} ${g.labels.join("、")}免運。`,
    )
    .join("")

  return `${fees}${steps}${free}${overseas}`
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
 * 活動的 buckets 用的是 API 的分組（cvs / cvsCod / home），那一組**不分超商**
 * —— apps/api 的 shippingBucket() 把 7-11 與全家都算成 cvs。所以一個「超商取貨
 * 滿 666 免運」的活動，兩家都吃得到，購物車的提示也要照這個事實展開。
 *
 * 少了這層對照，全家的客人在活動日會看到自己沒有的 1500 門檻。
 */
function campaignMethodKeys(buckets: string[]): ShippingMethodKey[] {
  const map: Record<string, ShippingMethodKey[]> = {
    cvs: ["cvs", "cvsFamily"],
    cvsCod: ["cvsCod", "cvsFamilyCod"],
    home: ["home"],
  }
  return buckets.flatMap((b) => map[b] ?? [])
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

  const methods = shippingMethods(s)
  const thresholds = new Map<ShippingMethodKey, number>(
    methods.map((m) => [m.key, m.threshold]),
  )

  for (const c of campaigns) {
    if (c.minOrder <= 0) continue
    if (c.weekdays.length > 0 && !c.weekdays.includes(now.getDay())) continue
    const keys = c.buckets.length > 0 ? campaignMethodKeys(c.buckets) : [...thresholds.keys()]
    for (const k of keys) {
      const current = thresholds.get(k)
      if (current === undefined) continue
      // 門檻 0 代表「這個方式不提供免運」，活動不該把它變成有免運。
      if (current <= 0) continue
      thresholds.set(k, Math.min(current, c.minOrder))
    }
  }

  const usable = methods.filter((m) => (thresholds.get(m.key) ?? 0) > 0)
  if (usable.length === 0) return null

  const threshold = Math.min(...usable.map((m) => thresholds.get(m.key) as number))
  const group = usable.filter((m) => thresholds.get(m.key) === threshold)

  return {
    reached: subtotal >= threshold,
    remaining: Math.max(0, threshold - subtotal),
    pct: Math.min(100, Math.round((subtotal / threshold) * 100)),
    threshold,
    methods:
      group.length === methods.length
        ? null
        : collapseCvsLabels(group.map((m) => m.label)).join("、"),
  }
}
