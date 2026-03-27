import { Router } from "express"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { z } from "zod"

export const productsRouter = Router()

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  images: z.array(z.object({
    url: z.string().url(),
    alt: z.string().optional(),
    sort_order: z.number().int().nonnegative(),
  })).optional(),
  is_active: z.boolean().optional(),
})

// GET /products — public, paginated
productsRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from("products")
    .select("id, name, slug, description, category_id, images, is_active, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (req.query.category) query = query.eq("category_id", req.query.category as string)
  if (req.query.status === "active") query = query.eq("is_active", true)
  if (req.query.status === "inactive") query = query.eq("is_active", false)
  if (req.query.q) {
    query = query.textSearch("search_vector", req.query.q as string, { type: "plain", config: "simple" })
  }

  const { data, error, count } = await query
  if (error) { res.status(500).json({ error: error.message }); return }

  res.json({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  })
})

// GET /products/:slug — public
productsRouter.get("/:slug", async (req, res) => {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id, name, slug, description, category_id, images, is_active, created_at,
      product_variants (id, sku, name, price, sale_price, stock_qty, weight, attributes)
    `)
    .eq("slug", req.params.slug)
    .single()

  const err = error as { code?: string; message?: string } | null
  if (!data || (err && err.code === "PGRST116")) {
    res.status(404).json({ error: "Product not found" }); return
  }
  if (err) { res.status(500).json({ error: err.message }); return }
  res.json({ data })
})

// POST /products — admin only
productsRouter.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("products")
    .insert(parsed.data)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ data })
})

// PUT /products/:id — admin only
productsRouter.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: "Product not found" }); return }
  res.json({ data })
})

// DELETE /products/:id — admin only
productsRouter.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", req.params.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})
