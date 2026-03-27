import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"

export const usersRouter = Router()

// ---------------------------------------------------------------------------
// GET /admin/users — list all team members (non-customer) (admin only)
// ---------------------------------------------------------------------------

usersRouter.get("/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, role, created_at")
    .neq("role", "customer")
    .order("created_at", { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ data: data ?? [] })
})

// ---------------------------------------------------------------------------
// PUT /admin/users/:id/role — change user role (admin only)
// ---------------------------------------------------------------------------

const updateRoleSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
})

usersRouter.put("/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateRoleSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  // Prevent changing own role
  const currentUserId = res.locals.userId as string
  if (req.params.id === currentUserId) {
    res.status(400).json({ error: "Cannot change your own role" }); return
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update({ role: parsed.data.role })
    .eq("user_id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: "User not found" }); return }
  res.json({ data })
})
