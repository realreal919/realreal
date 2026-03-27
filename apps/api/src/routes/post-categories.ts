import { Router } from "express"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { requireEditor } from "../middleware/editor"
import { z } from "zod"

export const postCategoriesPublicRouter = Router()
export const postCategoriesAdminRouter = Router()

const postCategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional().nullable(),
})

// GET /post-categories — public list
postCategoriesPublicRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("post_categories")
    .select("id, name, slug, description, created_at")
    .order("name", { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data: data ?? [] })
})

// POST /admin/post-categories — requireEditor
postCategoriesAdminRouter.post("/", requireAuth, requireEditor, async (req, res) => {
  const parsed = postCategorySchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("post_categories")
    .insert(parsed.data)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ data })
})

// PUT /admin/post-categories/:id — requireEditor
postCategoriesAdminRouter.put("/:id", requireAuth, requireEditor, async (req, res) => {
  const parsed = postCategorySchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("post_categories")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: "Post category not found" }); return }
  res.json({ data })
})

// DELETE /admin/post-categories/:id — requireAdmin
postCategoriesAdminRouter.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("post_categories")
    .delete()
    .eq("id", req.params.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})
