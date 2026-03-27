import { Router } from "express"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireEditor } from "../middleware/editor"
import { z } from "zod"

export const postTagsPublicRouter = Router()
export const postTagsAdminRouter = Router()

const postTagSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
})

// GET /post-tags — public list
postTagsPublicRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("post_tags")
    .select("id, name, slug, created_at")
    .order("name", { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data: data ?? [] })
})

// POST /admin/post-tags — requireEditor
postTagsAdminRouter.post("/", requireAuth, requireEditor, async (req, res) => {
  const parsed = postTagSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("post_tags")
    .insert(parsed.data)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ data })
})
