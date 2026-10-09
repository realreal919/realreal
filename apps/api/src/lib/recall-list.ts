/**
 * 一次性召回名單（規格 1.8）。
 *
 * 只產名單，不自動發送 —— 這批人距今 15~90 天，語氣與時機要店主自己判斷。
 * 自動寄的話，同一個人可能剛好前一天才收到回購提醒。
 */
export type RecallBucket = "reminder" | "long_time_no_see"

export type RecallCandidate = {
  user_id: string
  email: string | null
  display_name: string | null
  first_order_id: string
  first_order_number: string
  first_order_at: string
  days_since: number
  bucket: RecallBucket
}

export const BUCKET_LABEL: Record<RecallBucket, string> = {
  reminder: "回購提醒＋回購券",
  long_time_no_see: "好久不見＋回購券＋一個問題",
}

/**
 * 首購距今幾天 → 哪一組。
 *
 *   0~14 天  → 不處理（自動提醒會接手，重複打擾）
 *   15~45 天 → 回購提醒
 *   46~90 天 → 好久不見
 *   91 天以上 → 不在這次範圍
 */
export function bucketFor(daysSince: number): RecallBucket | null {
  if (daysSince < 15) return null
  if (daysSince <= 45) return "reminder"
  if (daysSince <= 90) return "long_time_no_see"
  return null
}

export function daysBetween(from: string, now: Date): number {
  const d = new Date(from)
  if (Number.isNaN(d.getTime())) return -1
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000)
}

/** CSV。Excel 開中文要 BOM，否則會變亂碼。 */
export function toCsv(rows: RecallCandidate[]): string {
  const header = ["Email", "姓名", "首購單號", "首購日期", "距今天數", "建議名單"]
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [header.join(",")]
  for (const r of rows) {
    lines.push(
      [
        esc(r.email),
        esc(r.display_name),
        esc(r.first_order_number),
        esc(r.first_order_at.slice(0, 10)),
        esc(r.days_since),
        esc(BUCKET_LABEL[r.bucket]),
      ].join(","),
    )
  }
  return "\uFEFF" + lines.join("\r\n")
}
