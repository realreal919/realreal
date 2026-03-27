import { Router } from "express"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { z } from "zod"

export const categoriesRouter = Router()

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  parent_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().nonnegative().optional(),
})

function buildTree(rows: any[]): any[] {
  const map = new Map(rows.map(r => [r.id, { ...r, children: [] }]))
  const roots: any[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// GET /categories — public
categoriesRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, sort_order")
    .order("sort_order", { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data: buildTree(data ?? []) })
})

// POST /categories — admin only
categoriesRouter.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = categorySchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("categories")
    .insert(parsed.data)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ data })
})

// PUT /categories/:id — admin only
categoriesRouter.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = categorySchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: "Category not found" }); return }
  res.json({ data })
})

// DELETE /categories/:id — admin only
categoriesRouter.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", req.params.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(204).send()
})
