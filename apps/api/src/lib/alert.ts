import { AsyncLocalStorage } from "node:async_hooks"
import { getSetting, getSettingOrEnv } from "./settings"
import { sendEmail, parseRecipients } from "./email"

/**
 * Operational alerting — replaces the old LINE Notify push.
 *
 * LINE Notify was shut down by LINE on 2025-03-31; `notify-api.line.me` is a
 * dead endpoint, so every "線上炸了" alert since then has gone nowhere.
 * Alerts now go out over the same Resend transport used for transactional mail.
 *
 * Because alerts share a send quota with customer order/shipping mail, an error
 * storm must never be allowed to burn that quota — otherwise an observability
 * problem escalates into a revenue problem (shipping notifications stop going
 * out). Three guards enforce that:
 *
 *   1. Per-fingerprint cooldown  — the same error alerts at most once per 15 min.
 *   2. Global hourly cap         — at most 10 alert emails per hour, total.
 *      This is the hard ceiling: no matter what happens upstream, this module
 *      cannot emit more than 10 emails an hour.
 *   3. Recursion guard           — an alert raised *while sending another alert*
 *                                  is dropped, so a failing alert can never
 *                                  amplify itself.
 *
 * On (3): this is deliberately an async-context guard, NOT a global mutex.
 * `Sentry.beforeSend` fires alerts without awaiting them, so a plain boolean
 * held across the send would silently discard every *other* error that arrived
 * while one email was in flight — i.e. it would fail hardest during exactly the
 * error storm it is supposed to survive. AsyncLocalStorage distinguishes "this
 * call is nested inside an alert send" (real recursion — drop it) from "this is
 * an unrelated concurrent error" (let it through, subject to 1 and 2).
 *
 * This function NEVER throws and NEVER rejects. Callers (including Sentry's
 * beforeSend) must be able to fire-and-forget it without wrapping it.
 */

/**
 * 2026-10-11 店主指定：錯誤通知最多 6 小時一封。
 *
 * 原本是「同一錯誤 15 分鐘一次、全域每小時 10 封」，最糟一天 240 封。
 * 寄信服務每天只有 100 封，而且是跟訂單確認、出貨通知共用的 —— 一次錯誤風暴
 * 就會把額度吃光，變成「監控壞掉順便讓客人收不到訂單確認信」。
 *
 * 壓到 6 小時一封之後，被擋掉的錯誤不會消失：它們記在 suppressed 裡，
 * 下一封信會把「這段期間另外發生了幾次、哪些」一起帶出來。完整列表仍看 Sentry。
 */
const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000
const GLOBAL_WINDOW_MS = 6 * 60 * 60 * 1000
const GLOBAL_MAX_PER_WINDOW = 1
/** Hard ceiling on one alert's total work, so a hung dependency can't wedge it. */
const SEND_TIMEOUT_MS = 20_000
/** Prune threshold for the dedupe map; entries older than the window are dead. */
const MAX_TRACKED_KEYS = 500

const lastSentByKey = new Map<string, number>()
/** 這個視窗內被擋掉的錯誤，下一封信會一併報出來。key = dedupeKey，value = 次數。 */
const suppressed = new Map<string, number>()
const inAlertSend = new AsyncLocalStorage<true>()
let globalWindowStart = 0
let globalCount = 0
let capWarned = false

/** Test seam: reset throttle state. Not used in production code paths. */
export function __resetAlertThrottle(): void {
  lastSentByKey.clear()
  suppressed.clear()
  globalWindowStart = 0
  globalCount = 0
  capWarned = false
}

function prune(now: number): void {
  if (lastSentByKey.size < MAX_TRACKED_KEYS) return
  for (const [k, t] of lastSentByKey) {
    if (now - t >= DEDUPE_WINDOW_MS) lastSentByKey.delete(k)
  }
}

function note(dedupeKey: string): void {
  suppressed.set(dedupeKey, (suppressed.get(dedupeKey) ?? 0) + 1)
}

/** 這個視窗內被擋掉的錯誤摘要，寫進下一封信。取完就清空。 */
function drainSuppressed(): string {
  if (suppressed.size === 0) return ""
  const total = [...suppressed.values()].reduce((a, b) => a + b, 0)
  const lines = [...suppressed.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, n]) => `  ×${n}  ${k}`)
  suppressed.clear()
  return `\n\n—— 這段期間另外被擋下的錯誤（共 ${total} 次）——\n${lines.join("\n")}`
}

function shouldSend(dedupeKey: string, now: number): boolean {
  // 1) per-fingerprint cooldown
  const last = lastSentByKey.get(dedupeKey)
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) {
    note(dedupeKey)
    return false
  }

  // 2) global cap
  if (now - globalWindowStart >= GLOBAL_WINDOW_MS) {
    globalWindowStart = now
    globalCount = 0
    capWarned = false
  }
  if (globalCount >= GLOBAL_MAX_PER_WINDOW) {
    note(dedupeKey)
    if (!capWarned) {
      capWarned = true
      console.warn(
        `[alert] cap (${GLOBAL_MAX_PER_WINDOW} / ${GLOBAL_WINDOW_MS / 3_600_000}h) reached — suppressing further alert emails until the window resets. Check Sentry directly.`,
      )
    }
    return false
  }

  prune(now)
  lastSentByKey.set(dedupeKey, now)
  globalCount++
  return true
}

/** Resolve alert recipients: ALERT_EMAIL env wins, else the admin notification inbox. */
async function resolveRecipients(): Promise<string[]> {
  const explicit = parseRecipients(
    await getSettingOrEnv("notifications.alert_email", "ALERT_EMAIL"),
  )
  if (explicit.length > 0) return explicit
  return parseRecipients(await getSetting("notifications.admin_email"))
}

async function deliver(title: string, body: string): Promise<void> {
  const to = await resolveRecipients()
  if (to.length === 0) {
    // Disabled path: no recipient configured. Log and move on — never throw,
    // never break the caller.
    console.warn(`[alert] no recipient configured, skipping: ${title}`)
    return
  }

  const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:600px">
        <h2 style="color:#b91c1c;margin:0 0 8px">🚨 ${escapeHtml(title)}</h2>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#f4f4f5;padding:12px;border-radius:6px;font-size:13px;color:#27272a">${escapeHtml(body + drainSuppressed())}</pre>
        <p style="margin:16px 0 0;font-size:12px;color:#687279">
          本信由系統自動送出，最多 ${GLOBAL_WINDOW_MS / 3_600_000} 小時一封。
          這段期間的其他錯誤已摘要在上方；完整列表請看 Sentry。
        </p>
      </div>
    `
  await sendEmail({ to, subject: `[RealReal] ${title}`, html })
}

export async function sendAlert({
  title,
  body,
  dedupeKey,
}: {
  title: string
  body: string
  dedupeKey?: string
}): Promise<void> {
  try {
    // Real recursion only — see the note at the top of this file.
    if (inAlertSend.getStore()) return

    const key = dedupeKey ?? title
    if (!shouldSend(key, Date.now())) return

    let timer: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        inAlertSend.run(true, () => deliver(title, body)),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            console.warn(`[alert] send timed out after ${SEND_TIMEOUT_MS}ms: ${title}`)
            resolve()
          }, SEND_TIMEOUT_MS)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  } catch (err) {
    // Swallow. An alert that fails must not take down the request that
    // triggered it, and must not itself become a new alert.
    //
    // Release the dedupe slot so the next occurrence of this error can try
    // again rather than being silenced for the full cooldown. The hourly cap
    // still bounds total attempts, so this cannot run away.
    lastSentByKey.delete(dedupeKey ?? title)
    console.warn("[alert] failed to send (non-fatal):", err)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
