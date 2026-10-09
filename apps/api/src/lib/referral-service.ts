/**
 * 推薦制度跟資料庫打交道的那一半。純判斷的規則在 referral.ts。
 */
import { supabase } from "./supabase"
import { getSetting } from "./settings"
import {
  DEFAULT_REFERRAL_SETTINGS,
  checkReferral,
  generateReferralCode,
  normalizeCode,
  sameContact,
  type ReferralSettings,
} from "./referral"

function num(raw: string | null, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export async function loadReferralSettings(): Promise<ReferralSettings> {
  const [minOrder, reward, budget] = await Promise.all([
    getSetting("referral.min_order"),
    getSetting("referral.reward"),
    getSetting("referral.monthly_budget"),
  ])
  // 雙方同額，所以兩邊讀同一個設定。刻意不用 referral.points —— 那一個是
  // 知心升等用的互動點數（interactions.ts 裡的 referral: 5 點），跟這裡的
  // 「50 元公益存款」是兩件事，共用一個設定會讓店主改一邊動到另一邊。
  const amount = num(reward, DEFAULT_REFERRAL_SETTINGS.refereeReward)
  return {
    minOrder: num(minOrder, DEFAULT_REFERRAL_SETTINGS.minOrder),
    refereeReward: amount,
    referrerPoints: amount,
    monthlyBudget: num(budget, DEFAULT_REFERRAL_SETTINGS.monthlyBudget),
  }
}

/**
 * 拿這位會員的推薦碼，沒有就現配一組。
 *
 * 註冊時不先配：舊會員本來就沒有，而且絕大多數人永遠不會打開推薦頁，
 * 先配等於幫 227 個帳號產生用不到的碼。第一次要看的時候再給。
 */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("referral_code")
    .eq("user_id", userId)
    .maybeSingle()
  const existing = (profile as { referral_code?: string | null } | null)?.referral_code
  if (existing) return existing

  // 碰撞極少，但 6 碼 31 字元的空間不是無限 —— 撞到就換一組再試，
  // 靠唯一索引判定成功與否，不靠先查一次（兩個人同時開推薦頁會都查到「沒人用」）
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateReferralCode()
    const { error } = await supabase
      .from("user_profiles")
      .update({ referral_code: code })
      .eq("user_id", userId)
    if (!error) return code
    if (!String(error.message).includes("duplicate")) {
      console.warn("[referral] 配發推薦碼失敗:", error)
      return null
    }
  }
  console.warn(`[referral] 連續 8 次撞號，沒有配到推薦碼 user=${userId}`)
  return null
}

/** 把推薦碼換成推薦人的 user_id。查無此碼回 null。 */
export async function resolveReferrer(rawCode: string | null | undefined): Promise<string | null> {
  const code = normalizeCode(rawCode)
  if (!code) return null
  const { data } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("referral_code", code)
    .maybeSingle()
  return (data as { user_id?: string } | null)?.user_id ?? null
}

/** 這位會員在這張單之前買過沒有。只算真的成立的訂單。 */
async function hasPriorOrder(userId: string, exceptOrderId: string): Promise<boolean> {
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("order_type", "retail")
    .in("status", ["paid", "processing", "shipped", "delivered", "completed"])
    .neq("id", exceptOrderId)
  return (count ?? 0) > 0
}

async function rewardsThisMonth(): Promise<number> {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .gte("confirmed_at", start.toISOString())
  return count ?? 0
}

/**
 * 兩邊是不是同一個人。
 *
 * 比對的是「會員資料上的手機」與「這張單的收件資料 vs 推薦人過去訂單的收件
 * 資料」。只看 user_profiles.phone 不夠 —— 開小號時最省事的做法就是不填會員
 * 手機，直接在結帳頁打同一個電話、寄到同一個地址。
 */
async function contactsMatch(
  referrerId: string,
  refereeId: string,
  refereeOrderId: string,
): Promise<boolean> {
  const [profiles, refereeAddr, referrerOrders] = await Promise.all([
    supabase.from("user_profiles").select("user_id, phone").in("user_id", [referrerId, refereeId]),
    supabase
      .from("order_addresses")
      .select("phone, address")
      .eq("order_id", refereeOrderId)
      .limit(5),
    supabase
      .from("orders")
      .select("id")
      .eq("user_id", referrerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  const phones = new Map(
    ((profiles.data ?? []) as Array<{ user_id: string; phone: string | null }>).map((p) => [
      p.user_id,
      p.phone,
    ]),
  )
  if (sameContact({ phone: phones.get(referrerId) }, { phone: phones.get(refereeId) })) return true

  const mine = (refereeAddr.data ?? []) as Array<{ phone: string | null; address: string | null }>
  if (mine.length === 0) return false

  const orderIds = ((referrerOrders.data ?? []) as Array<{ id: string }>).map((o) => o.id)
  if (orderIds.length === 0) {
    // 推薦人沒有訂單可比，只剩會員手機那一關（上面已經比過）
    return mine.some((m) => sameContact({ phone: phones.get(referrerId) }, m))
  }

  const { data: theirs } = await supabase
    .from("order_addresses")
    .select("phone, address")
    .in("order_id", orderIds)
  for (const a of mine) {
    for (const b of ((theirs ?? []) as Array<{ phone: string | null; address: string | null }>)) {
      if (sameContact(a, b)) return true
    }
  }
  return false
}

type OrderForReferral = {
  id: string
  user_id: string | null
  order_number: string
  subtotal: number | string | null
  referred_by: string | null
  referral_code_used: string | null
  referral_status: string | null
}

/**
 * 訂單付款後結算推薦獎勵。
 *
 * 放在 post-payment 跟消費累積、公益存款同一個時間點 —— 不是因為那裡最安全，
 * 而是因為那是站上「這筆錢算數了」唯一的定義。獎勵若改在到貨才發，會跟整個
 * 系統其他部分的時間基準對不上，對帳時沒人說得出哪個才對。
 *
 * 可以重複呼叫：referrals 的唯一索引與 points_ledger 的 referral 索引各自擋
 * 一次，補跑不會重複發放。
 */
export async function settleReferralForOrder(orderId: string): Promise<
  { granted: false; reason: string } | { granted: true; referrerId: string; refereeId: string }
> {
  const { data } = await supabase
    .from("orders")
    .select("id, user_id, order_number, subtotal, referred_by, referral_code_used, referral_status")
    .eq("id", orderId)
    .maybeSingle()
  const order = data as OrderForReferral | null
  if (!order) return { granted: false, reason: "找不到訂單" }
  if (!order.referred_by || !order.user_id) return { granted: false, reason: "這張單沒有推薦人" }
  if (order.referral_status === "confirmed") return { granted: false, reason: "已經結算過了" }

  const settings = await loadReferralSettings()

  // 已經被推薦成功過的人不再算一次。唯一索引也會擋，但先查一次能把理由寫清楚
  const { count: already } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referee_id", order.user_id)
    .eq("status", "confirmed")

  const contactMatches = await contactsMatch(order.referred_by, order.user_id, order.id)

  const verdict =
    (already ?? 0) > 0
      ? { ok: false as const, reason: "這位新朋友已經被推薦成功過", deferred: false }
      : checkReferral({
          referrerId: order.referred_by,
          refereeId: order.user_id,
          // 門檻看折扣前，不看實收 —— 看折後的話，同樣買 700 元的東西，
          // 用了優惠碼就不算推薦成功，客人問起來沒有道理可講
          subtotalBeforeDiscount: Number(order.subtotal) || 0,
          refereeHasPriorOrder: await hasPriorOrder(order.user_id, order.id),
          rewardsThisMonth: await rewardsThisMonth(),
          settings,
          contactMatches,
        })

  if (!verdict.ok) {
    const status = verdict.deferred ? "deferred" : "rejected"
    await supabase.from("orders").update({ referral_status: status }).eq("id", order.id)
    // deferred 不寫 referrals —— 那張表是「成立過的推薦」，塞進沒成立的列
    // 會讓每月預算的計數跟著虛胖
    if (!verdict.deferred) {
      await supabase.from("referrals").insert({
        referrer_id: order.referred_by,
        referee_id: order.user_id,
        order_id: order.id,
        status: "rejected",
        reject_reason: verdict.reason,
      })
    }
    return { granted: false, reason: verdict.reason }
  }

  // 1) 先寫 referrals。唯一索引（一張訂單一次、一位新朋友一次）是真正擋重複的
  //    東西；先寫它，後面的發放才有「這次是不是第一次」可以依據。
  const { error: refErr } = await supabase.from("referrals").insert({
    referrer_id: order.referred_by,
    referee_id: order.user_id,
    order_id: order.id,
    status: "confirmed",
    points: settings.referrerPoints,
    reward_amount: settings.refereeReward,
    confirmed_at: new Date().toISOString(),
  })
  if (refErr) {
    // 撞到唯一索引＝別的執行緒已經發過了，這不是錯誤
    if (String(refErr.message).includes("duplicate")) {
      return { granted: false, reason: "已經結算過了" }
    }
    console.error("[referral] 寫入推薦紀錄失敗，沒有發放:", refErr)
    return { granted: false, reason: refErr.message }
  }

  // 2) 推薦人的公益存款回饋金
  const { error: pointsErr } = await supabase.from("points_ledger").insert({
    user_id: order.referred_by,
    delta: settings.referrerPoints,
    source: "referral",
    source_ref_id: order.id,
    note: `推薦回饋（訂單 ${order.order_number}）`,
  })
  // duplicate = 之前已經發過，那是正常的補跑
  if (pointsErr && !String(pointsErr.message).includes("duplicate")) {
    // 回饋金沒發出去，就不能留下一筆「已成立」的推薦 —— 那會讓這筆永遠不會
    // 被重試（唯一索引擋住），而推薦人手上什麼都沒有，也沒有人會發現。
    // 收回 referrals 這一列，讓下一次 post-payment 重跑還有機會。
    console.error("[referral] 推薦人回饋金寫入失敗，撤回這筆推薦:", pointsErr)
    await supabase.from("referrals").delete().eq("order_id", order.id)
    await supabase.from("orders").update({ referral_status: "pending" }).eq("id", order.id)
    return { granted: false, reason: `回饋金寫入失敗：${pointsErr.message}` }
  }

  // 3) 新朋友的 50 元。跟推薦人一樣記入公益存款 —— 信裡寫的是
  // 「您與朋友都能各獲得 50 元公益存款，可於下次消費時折抵使用」，
  // 發券的話兩邊拿到的東西不同類，客服要解釋兩次。
  // 公益存款本來就可以下一單折抵，效果跟購物金一樣。
  const { error: couponErr } = await supabase.from("points_ledger").insert({
    user_id: order.user_id,
    delta: settings.refereeReward,
    source: "referral",
    source_ref_id: `${order.id}:referee`,
    note: `推薦回饋（首購訂單 ${order.order_number}）`,
  })
  if (couponErr && !String(couponErr.message).includes("duplicate")) {
    // 新朋友那筆發不出去不撤回整筆 —— 推薦人的回饋金已經進帳，撤回會把
    // 他的錢也一起拿掉。記下來人工補發，這是兩害相權。
    console.error(
      `[referral] 新朋友的回饋金發放失敗，需人工補發 order=${order.order_number} user=${order.user_id}:`,
      couponErr,
    )
  }

  await supabase.from("orders").update({ referral_status: "confirmed" }).eq("id", order.id)

  return { granted: true, referrerId: order.referred_by, refereeId: order.user_id }
}
