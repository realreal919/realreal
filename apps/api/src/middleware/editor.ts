import type { Request, Response, NextFunction } from "express"
import { supabase } from "../lib/supabase"

export async function requireEditor(req: Request, res: Response, next: NextFunction) {
  const userId = res.locals.userId as string | undefined
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return }

  const { data, error } = await supabase
    .from("user_profiles").select("role").eq("user_id", userId).single()

  if (error) { res.status(500).json({ error: "Internal server error" }); return }
  if (data?.role !== "admin" && data?.role !== "editor") { res.status(403).json({ error: "Forbidden" }); return }
  next()
}
