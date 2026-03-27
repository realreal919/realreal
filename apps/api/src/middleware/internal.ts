import type { Request, Response, NextFunction } from "express"
import { timingSafeEqual } from "crypto"

export function requireInternal(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.INTERNAL_API_SECRET
  const provided = req.headers["x-internal-secret"]

  if (!expected || !provided || typeof provided !== "string") {
    res.status(401).json({ error: "Unauthorized" }); return
  }

  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)

  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    res.status(401).json({ error: "Unauthorized" }); return
  }

  next()
}
