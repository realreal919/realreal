import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireEditor } from "../middleware/editor"

export const siteContentsRouter = Router()

// ---------------------------------------------------------------------------
// GET /site-contents/:key — public, returns value JSONB for a given key
// ---------------------------------------------------------------------------

siteContentsRouter.get("/site-contents/:key", async (req, res) => {
  const { data, error } = await supabase
    .from("site_contents")
    .select("value")
    .eq("key", req.params.key)
    .single()

  const err = error as { code?: string; message?: string } | null
  if (!data || (err && err.code === "PGRST116")) {
    res.status(404).json({ error: "Key not found" }); return
  }
  if (err) { res.status(500).json({ error: err.message }); return }
  res.json({ data: data.value })
})

// ---------------------------------------------------------------------------
// GET /admin/site-contents — list all site_contents records (editor+)
// ---------------------------------------------------------------------------

siteContentsRouter.get("/admin/site-contents", requireAuth, requireEditor, async (_req, res) => {
  const { data, error } = await supabase
    .from("site_contents")
    .select("id, key, updated_at")
    .order("key", { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data: data ?? [] })
})

// ---------------------------------------------------------------------------
// PUT /admin/site-contents/:key — update value JSONB for a given key (editor+)
// ---------------------------------------------------------------------------

const updateValueSchema = z.object({
  value: z.unknown(),
}).strict()

siteContentsRouter.put("/admin/site-contents/:key", requireAuth, requireEditor, async (req, res) => {
  const parsed = updateValueSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const userId = res.locals.userId as string

  // Upsert: create the key if it doesn't exist yet, otherwise update
  const { data, error } = await supabase
    .from("site_contents")
    .upsert(
      {
        key: req.params.key,
        value: parsed.data.value,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    )
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data })
})
