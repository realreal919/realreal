import type { Request, Response, NextFunction } from "express"
import { supabase } from "../lib/supabase"

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" }); return
  }
  const token = authHeader.slice(7)

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) { res.status(401).json({ error: "Invalid token" }); return }

  res.locals.userId = user.id
  res.locals.userEmail = user.email
  next()
}
