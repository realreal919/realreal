import type { Request, Response, NextFunction } from "express"

export function requireInternal(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-internal-secret"] !== process.env.INTERNAL_API_SECRET) {
    res.status(401).json({ error: "Unauthorized" }); return
  }
  next()
}
