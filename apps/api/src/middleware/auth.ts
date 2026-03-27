import type { Request, Response, NextFunction } from "express"
import { supabase } from "../lib/supabase"

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "")
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return }

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) { res.status(401).json({ error: "Invalid token" }); return }

  res.locals.userId = user.id
  res.locals.userEmail = user.email
  next()
}
