import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response, NextFunction } from "express"

// Mock supabase before imports
vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}))

import { supabase } from "../../lib/supabase"
import { requireAuth } from "../auth"
import { requireAdmin } from "../admin"
import { requireInternal } from "../internal"

function makeReqRes(overrides: Partial<Request> = {}) {
  const req = { headers: {}, ...overrides } as unknown as Request
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: {},
  } as unknown as Response
  const next = vi.fn() as unknown as NextFunction
  return { req, res, next }
}

describe("requireAuth", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 401 when no Authorization header", async () => {
    const { req, res, next } = makeReqRes()
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it("returns 401 when token is invalid", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null }, error: new Error("Invalid")
    } as any)
    const { req, res, next } = makeReqRes({ headers: { authorization: "Bearer bad-token" } })
    await requireAuth(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it("calls next and sets res.locals.userId on valid token", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "user-123", email: "a@b.com" } }, error: null
    } as any)
    const { req, res, next } = makeReqRes({ headers: { authorization: "Bearer valid-token" } })
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.locals.userId).toBe("user-123")
  })
})

describe("requireAdmin", () => {
  it("returns 401 when no userId in locals", async () => {
    const { req, res, next } = makeReqRes()
    await requireAdmin(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("returns 403 when user is not admin", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "customer" } }),
    } as any)
    const { req, res, next } = makeReqRes()
    ;(res as any).locals.userId = "user-123"
    await requireAdmin(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("calls next when user is admin", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "admin" } }),
    } as any)
    const { req, res, next } = makeReqRes()
    ;(res as any).locals.userId = "admin-123"
    await requireAdmin(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})

describe("requireInternal", () => {
  it("returns 401 on wrong secret", () => {
    const { req, res, next } = makeReqRes({
      headers: { "x-internal-secret": "wrong" },
    })
    requireInternal(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it("calls next on correct secret", () => {
    const { req, res, next } = makeReqRes({
      headers: { "x-internal-secret": "test-internal-secret" },
    })
    requireInternal(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})
