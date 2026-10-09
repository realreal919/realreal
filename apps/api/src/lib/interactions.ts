/**
 * 互動點數的規則。
 *
 * 會員看不到點數，只有管理者在後台用。管理者要做的判斷只有一個 ——「這是哪一
 * 種分享」—— 點數、每月上限、升等資格全部由這裡算，不靠人記。
 */

/** member_interactions.type 的值，與店主文案的對照。 */
export const INTERACTION_TYPES = {
  testimonial: { label: "使用心得", points: 3 },
  social_share: { label: "IG・Threads・FB", points: 2 },
  platform_share: { label: "Dcard・PTT", points: 3 },
  campaign_participation: { label: "參與活動", points: 1 },
  referral: { label: "成功推薦", points: 5 },
} as const

export type InteractionType = keyof typeof INTERACTION_TYPES

export function isInteractionType(v: unknown): v is InteractionType {
  return typeof v === "string" && v in INTERACTION_TYPES
}

export function pointsFor(type: InteractionType): number {
  return INTERACTION_TYPES[type].points
}

/** 同一類型每月最多計 2 次。 */
export const MONTHLY_CAP_PER_TYPE = 2

export type CountedInteraction = {
  type: string
  points: number | string | null
  occurred_on: string
}

/** 某人某類型在指定月份已經記過幾次。 */
export function monthlyCount(
  interactions: CountedInteraction[],
  type: InteractionType,
  when: Date,
): number {
  const y = when.getFullYear()
  const m = when.getMonth()
  return interactions.filter((i) => {
    if (i.type !== type) return false
    const d = new Date(i.occurred_on)
    return !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m
  }).length
}

export type CapCheck = { allowed: true } | { allowed: false; reason: string; used: number }

/**
 * 這一筆還能不能記點。
 *
 * 擋在後端而不是只在畫面上提示：上限的意義是「超過就不該進帳」，靠管理者
 * 自己看數字記得停，遲早會有一筆漏掉，而且事後很難發現。
 */
export function canCount(
  interactions: CountedInteraction[],
  type: InteractionType,
  when: Date = new Date(),
): CapCheck {
  const used = monthlyCount(interactions, type, when)
  if (used >= MONTHLY_CAP_PER_TYPE) {
    return {
      allowed: false,
      used,
      reason: `${INTERACTION_TYPES[type].label}本月已記 ${used} 次，達上限 ${MONTHLY_CAP_PER_TYPE} 次`,
    }
  }
  return { allowed: true }
}

export type UpgradeCheck = {
  points: number
  typeCount: number
  eligible: boolean
}

/** 知心條件 B：6 個月內互動點數 ≥ 6，且至少 2 種類型。 */
export const ZHIXIN_MIN_POINTS = 6
export const ZHIXIN_MIN_TYPES = 2
export const ZHIXIN_WINDOW_MONTHS = 6

export function checkUpgrade(
  interactions: CountedInteraction[],
  now: Date = new Date(),
): UpgradeCheck {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - ZHIXIN_WINDOW_MONTHS)

  const recent = interactions.filter((i) => {
    const d = new Date(i.occurred_on)
    return !Number.isNaN(d.getTime()) && d >= cutoff
  })

  const points = recent.reduce((sum, i) => sum + (Number(i.points) || 0), 0)
  const typeCount = new Set(recent.map((i) => i.type)).size

  return {
    points,
    typeCount,
    eligible: points >= ZHIXIN_MIN_POINTS && typeCount >= ZHIXIN_MIN_TYPES,
  }
}
