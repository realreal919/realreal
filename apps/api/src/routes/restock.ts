import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { sendEmail } from "../lib/email"
import { renderRestockNotice, restockSubject } from "../emails/RestockNotice"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"

/**
 * 到貨通知（2026-11-17 店主指定）。
 *
 * 缺貨的商品頁讓客人留下信箱；貨到了由店主在後台按一次「通知他們」才寄信。
 * 不自動寄 —— 補貨數量常常不夠所有登記的人，自動寄等於同時叫一群人來搶，
 * 先到的買到、其他人收到的是一封空歡喜的信。
 */
export const restockRouter = Router()
export const restockAdminRouter = Router()

const SITE_URL = process.env.SITE_URL ?? "https://realreal.cc"

const subscribeSchema = z.object({
  productId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(200),
})

// POST /restock — 公開。留下信箱等到貨。
restockRouter.post("/", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "請輸入正確的電子信箱" })
    return
  }
  const { productId, email } = parsed.data

  const { data: product, error: productErr } = await supabase
    .from("products")
    .select("id, name, is_active")
    .eq("id", productId)
    .maybeSingle()

  if (productErr) {
    console.error("[restock] 查商品失敗:", productErr)
    res.status(500).json({ error: "暫時無法登記，請稍後再試" })
    return
  }
  if (!product || !product.is_active) {
    res.status(404).json({ error: "找不到這個商品" })
    return
  }

  const { error } = await supabase.from("restock_subscriptions").insert({
    product_id: productId,
    email,
    user_id: (req as { user?: { id?: string } }).user?.id ?? null,
  })

  // 撞到唯一索引＝這個信箱已經在等這個商品了。對客人來說結果一樣（他會收到
  // 通知），所以照樣回成功 —— 回錯誤只會讓人以為沒登記到，再按一次。
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    console.error("[restock] 登記失敗:", error)
    res.status(500).json({ error: "暫時無法登記，請稍後再試" })
    return
  }

  res.json({ ok: true })
})

// GET /admin/restock — 還在等貨的名單，按商品分組。
restockAdminRouter.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from("restock_subscriptions")
    .select("id, product_id, email, created_at, products(name, slug)")
    .is("notified_at", null)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[restock] 讀取名單失敗:", error)
    res.status(500).json({ error: "讀取失敗" })
    return
  }

  type Row = {
    id: string
    product_id: string
    email: string
    created_at: string
    products: { name: string; slug: string } | null
  }

  const groups = new Map<
    string,
    { productId: string; name: string; slug: string; count: number; waiting: Array<{ email: string; created_at: string }> }
  >()

  for (const r of (data ?? []) as unknown as Row[]) {
    const g = groups.get(r.product_id) ?? {
      productId: r.product_id,
      name: r.products?.name ?? "（商品已刪除）",
      slug: r.products?.slug ?? "",
      count: 0,
      waiting: [],
    }
    g.count += 1
    g.waiting.push({ email: r.email, created_at: r.created_at })
    groups.set(r.product_id, g)
  }

  res.json({
    data: Array.from(groups.values()).sort((a, b) => b.count - a.count),
  })
})

// POST /admin/restock/:productId/notify — 寄信給等這個商品的所有人。
restockAdminRouter.post("/:productId/notify", requireAuth, requireAdmin, async (req, res) => {
  const productId = req.params.productId

  const { data: product } = await supabase
    .from("products")
    .select("id, name, slug")
    .eq("id", productId)
    .maybeSingle()

  if (!product) {
    res.status(404).json({ error: "找不到這個商品" })
    return
  }

  const { data: rows, error } = await supabase
    .from("restock_subscriptions")
    .select("id, email")
    .eq("product_id", productId)
    .is("notified_at", null)

  if (error) {
    console.error("[restock] 讀取待通知名單失敗:", error)
    res.status(500).json({ error: "讀取失敗" })
    return
  }

  const waiting = (rows ?? []) as Array<{ id: string; email: string }>
  if (waiting.length === 0) {
    res.json({ ok: true, sent: 0, failed: 0 })
    return
  }

  const html = renderRestockNotice({
    productName: product.name as string,
    productUrl: `${SITE_URL}/shop/${product.slug}`,
  })
  const subject = restockSubject(product.name as string)

  // 一封一封寄，而且**寄成功才標記**。
  //
  // 先整批標記再寄的話，中間任何一封失敗，那位客人就永遠不會再被通知到 ——
  // 名單上已經沒有他了，沒有人會發現。寧可重寄也不要漏寄。
  let sent = 0
  const failed: string[] = []
  for (const row of waiting) {
    try {
      await sendEmail({ to: row.email, subject, html })
      const { error: markErr } = await supabase
        .from("restock_subscriptions")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", row.id)
      if (markErr) {
        // 信已經寄出去了，標記卻失敗 —— 下次再按會重寄給這個人。
        // 這是兩害相權取其輕：重複一封到貨通知，好過有人永遠等不到。
        console.error(`[restock] 標記失敗（信已寄出）${row.email}:`, markErr)
      }
      sent += 1
    } catch (err) {
      console.error(`[restock] 寄送失敗 ${row.email}:`, err)
      failed.push(row.email)
    }
  }

  res.json({ ok: true, sent, failed: failed.length, failedEmails: failed })
})
