/**
 * 檔期到期自動下架 —— 每小時掃一次。
 *
 * 為什麼需要：限時檔期原本只有前台的倒數框會在時間到時消失，商品本身還留在
 * 架上照常賣。2026-10-04 的「穩定補給 30 天組合」就是這樣，倒數跑完隔天還
 * 買得到，店主自己發現才手動下架。倒數與下架看同一個欄位（products.delist_at）
 * 之後，不會再出現「倒數結束但還買得到」。
 *
 * 安全邊界，兩道：
 *   1. 只處理「有填 delist_at 且目前上架中」的商品。NULL 一律不碰，所以沒有
 *      設檔期的商品永遠不會被這支程式動到。
 *   2. 只下架、不上架。誤填一個過去的時間，最壞是商品被下架 —— 看得到、
 *      改得回來；反過來讓排程把該停賣的東西自己上架，才是真的危險。
 *
 * 下架後不清掉 delist_at：留著才看得出「這個商品是被檔期下架的、什麼時候」。
 * 店主手動重新上架時也不會馬上又被掃下去 —— 因為下一輪它已經是下架狀態，
 * 條件 is_active = true 不成立；真的要再開一次檔期，就填一個新的時間。
 */
import { Worker, Queue } from "bullmq"
import { Redis } from "ioredis"
import * as Sentry from "@sentry/node"
import { supabase } from "../lib/supabase"

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

export const delistExpiredQueue = new Queue("delist-expired-products", { connection })

/** 單次上限 —— 防呆。正常一次檔期到期只有一兩筆。 */
const MAX_PER_RUN = 50

export type DelistRow = { id: string; name: string; slug: string; delist_at: string | null }

export type DelistSummary = {
  checked: number
  delisted: number
  failed: number
  names: string[]
}

/** 到期判斷：有時間且已經過了。NULL 一律不到期。 */
export function isExpired(row: Pick<DelistRow, "delist_at">, now: Date): boolean {
  if (!row.delist_at) return false
  const t = new Date(row.delist_at).getTime()
  if (Number.isNaN(t)) return false
  return t <= now.getTime()
}

export async function delistExpiredProducts(now = new Date()): Promise<DelistSummary> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, delist_at")
    .not("delist_at", "is", null)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("delist_at", { ascending: true })
    .limit(200)

  if (error) throw new Error(`delist-expired-products query failed: ${error.message}`)

  const rows = (data ?? []) as DelistRow[]
  const due = rows.filter((r) => isExpired(r, now)).slice(0, MAX_PER_RUN)

  let delisted = 0
  let failed = 0
  const names: string[] = []

  for (const row of due) {
    const { error: updErr } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", row.id)
      // 只有仍在架上才動它 —— 中途被店主自己下架時不要再寫一次。
      .eq("is_active", true)
    if (updErr) {
      failed++
      console.error(`[delist-expired-products] ${row.slug} 下架失敗：`, updErr.message)
      Sentry.captureException(new Error(updErr.message), {
        tags: { component: "delist-expired-products" },
        extra: { slug: row.slug, delistAt: row.delist_at },
      })
      continue
    }
    delisted++
    names.push(row.name)
  }

  const summary: DelistSummary = { checked: rows.length, delisted, failed, names }
  console.log(
    `[delist-expired-products] 有檔期且上架中 ${summary.checked} 筆，到期下架 ${summary.delisted} 筆，失敗 ${summary.failed} 筆` +
      (summary.names.length ? `：${summary.names.join("、")}` : ""),
  )
  return summary
}

export const delistExpiredWorker = new Worker(
  "delist-expired-products",
  async (job) => {
    if (job.name !== "delist") return
    return delistExpiredProducts()
  },
  { connection },
)
