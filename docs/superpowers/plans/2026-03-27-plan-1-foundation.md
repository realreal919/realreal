# Plan 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the full monorepo, initialize Supabase schema, Railway API skeleton, and Supabase Auth — so every subsequent plan has a working foundation to build on.

**Architecture:** Turborepo monorepo with `apps/web` (Next.js 15), `apps/api` (Express + BullMQ on Railway), and `packages/db` (Supabase client + typed schema). Supabase handles auth (JWT in httpOnly cookies) and PostgreSQL. Railway API validates Supabase JWTs on every request.

**Tech Stack:** Next.js 15 App Router, TypeScript, Turborepo, Express 5, Supabase JS v2 + @supabase/ssr, Drizzle ORM, shadcn/ui, Tailwind CSS, Geist font, Zod, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-26-realreal-rewrite-design.md`

---

## File Map

```
realreal/
├── package.json                      # Turborepo root
├── turbo.json                        # Turborepo pipeline
├── .env.example                      # Root env example
├── apps/
│   ├── web/                          # Next.js 15 (Vercel)
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   └── auth/
│   │   │   │       ├── actions.ts
│   │   │   │       ├── login/page.tsx
│   │   │   │       ├── register/page.tsx
│   │   │   │       ├── forgot-password/page.tsx
│   │   │   │       └── reset-password/page.tsx
│   │   │   ├── components/ui/        # shadcn/ui
│   │   │   ├── lib/
│   │   │   │   ├── supabase/
│   │   │   │   │   ├── client.ts
│   │   │   │   │   └── server.ts
│   │   │   │   └── api-client.ts
│   │   │   └── middleware.ts
│   │   └── .env.local.example
│   └── api/                          # Express API (Railway)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── index.ts              # Entry: calls app.listen()
│       │   ├── app.ts                # Express app (no listen — testable)
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   ├── admin.ts
│       │   │   └── internal.ts
│       │   ├── routes/
│       │   │   └── health.ts
│       │   └── lib/
│       │       └── supabase.ts
│       ├── scripts/
│       │   └── seed-admin.ts
│       └── .env.example
└── packages/
    └── db/
        ├── package.json
        ├── src/schema/
        │   ├── users.ts
        │   ├── products.ts
        │   ├── orders.ts
        │   ├── payments.ts
        │   └── subscriptions.ts
        ├── src/index.ts
        └── migrations/
            └── 0001_initial.sql
```

---

## Task 1: Turborepo Monorepo Scaffold

**Files:**
- Create: `package.json` (root)
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Init root package.json**

```bash
cd /Users/cataholic/Desktop/airport/realreal
npm init -y
npm install turbo --save-dev
```

- [ ] **Step 2: Write root package.json**

```json
{
  "name": "realreal",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test"
  },
  "devDependencies": {
    "turbo": "latest"
  },
  "workspaces": ["apps/*", "packages/*"]
}
```

- [ ] **Step 3: Write turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

- [ ] **Step 4: Write .gitignore**

```
node_modules
.turbo
.env*.local
.env.local
dist
.next
```

- [ ] **Step 5: Write root .env.example**

```bash
# ── Vercel (apps/web) ──────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=https://realreal.cc
RAILWAY_API_URL=http://localhost:4000
INTERNAL_API_SECRET=

# Payment webhook validation
PCHOMEPAY_HASH_KEY=
PCHOMEPAY_HASH_IV=
LINEPAY_CHANNEL_SECRET=
JKOPAY_PUBLIC_KEY=

# ── Railway (apps/api) ─────────────────────────────
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
INTERNAL_API_SECRET=
PAYMENT_TOKEN_ENCRYPTION_KEY=

PCHOMEPAY_MERCHANT_ID=
PCHOMEPAY_HASH_KEY=
PCHOMEPAY_HASH_IV=

LINEPAY_CHANNEL_ID=
LINEPAY_CHANNEL_SECRET=

JKOPAY_STORE_ID=
JKOPAY_API_KEY=

ECPAY_MERCHANT_ID=
ECPAY_HASH_KEY=
ECPAY_HASH_IV=

AMEGO_TAX_ID=60515111
AMEGO_APP_KEY=

EMAIL_SMTP_HOST=
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=

TZ=Asia/Taipei

# Seed script only
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
```

- [ ] **Step 6: Commit**

```bash
git init
git add package.json turbo.json .gitignore .env.example
git commit -m "chore: init turborepo monorepo scaffold"
```

---

## Task 2: Next.js App Setup

**Files:**
- Create: `apps/web/` (full Next.js 15 project)
- Create: `apps/web/vitest.config.ts`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps
npx create-next-app@latest web \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npm install @supabase/supabase-js @supabase/ssr
npm install geist zod
npm install --save-dev vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init
# When prompted: Default style, Zinc color, CSS variables: yes
npx shadcn@latest add button input label form card sonner
```

- [ ] **Step 4: Write vitest.config.ts**

`apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
```

- [ ] **Step 5: Write test setup file**

`apps/web/src/test-setup.ts`:
```typescript
import "@testing-library/jest-dom"
```

- [ ] **Step 6: Write next.config.ts**

```typescript
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
}

export default nextConfig
```

- [ ] **Step 7: Write root layout with Geist font**

`apps/web/src/app/layout.tsx`:
```typescript
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "誠真生活 RealReal",
  description: "純粹投入，誠真健康",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
```

- [ ] **Step 8: Write homepage placeholder**

`apps/web/src/app/page.tsx`:
```typescript
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">誠真生活 RealReal</h1>
    </main>
  )
}
```

- [ ] **Step 9: Start dev and verify**

```bash
npm run dev
```
Open `http://localhost:3000` — expect "誠真生活 RealReal"

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): init Next.js 15 app with shadcn/ui and Geist font"
```

---

## Task 3: Supabase Client + Railway API Client

**Files:**
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/.env.local.example`
- Create: `apps/web/src/lib/__tests__/api-client.test.ts`

- [ ] **Step 1: Write failing test for api-client**

`apps/web/src/lib/__tests__/api-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

process.env.RAILWAY_API_URL = "http://test-api:4000"
process.env.INTERNAL_API_SECRET = "test-secret"

const { apiClient } = await import("../api-client")

describe("apiClient", () => {
  beforeEach(() => mockFetch.mockReset())

  it("calls correct URL", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    await apiClient("/health")
    expect(mockFetch).toHaveBeenCalledWith(
      "http://test-api:4000/health",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    )
  })

  it("attaches Bearer token when provided", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    await apiClient("/orders", { token: "abc123" })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer abc123" }),
      })
    )
  })

  it("attaches internal secret when internal=true", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    await apiClient("/internal", { internal: true })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Internal-Secret": "test-secret" }),
      })
    )
  })

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ message: "Not found" }),
    })
    await expect(apiClient("/missing")).rejects.toThrow("Not found")
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx vitest run src/lib/__tests__/api-client.test.ts
```
Expected: FAIL — "Cannot find module ../api-client"

- [ ] **Step 3: Write Supabase browser client**

`apps/web/src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

- [ ] **Step 4: Write Supabase server client**

`apps/web/src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 5: Write Railway API client**

`apps/web/src/lib/api-client.ts`:
```typescript
const API_URL = process.env.RAILWAY_API_URL ?? "http://localhost:4000"
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? ""

export async function apiClient<T>(
  path: string,
  options: RequestInit & { token?: string; internal?: boolean } = {}
): Promise<T> {
  const { token, internal, ...fetchOptions } = options
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(internal && { "X-Internal-Secret": INTERNAL_SECRET }),
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers: { ...headers, ...(fetchOptions.headers as Record<string, string>) },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 6: Run test — expect PASS**

```bash
npx vitest run src/lib/__tests__/api-client.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 7: Write .env.local.example**

`apps/web/.env.local.example`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
RAILWAY_API_URL=http://localhost:4000
INTERNAL_API_SECRET=dev-secret-change-in-prod
PCHOMEPAY_HASH_KEY=
PCHOMEPAY_HASH_IV=
LINEPAY_CHANNEL_SECRET=
JKOPAY_PUBLIC_KEY=
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib apps/web/.env.local.example apps/web/vitest.config.ts apps/web/src/test-setup.ts
git commit -m "feat(web): Supabase SSR clients and Railway API client with tests"
```

---

## Task 4: Next.js Auth Middleware

**Files:**
- Create: `apps/web/src/middleware.ts`

- [ ] **Step 1: Write middleware**

`apps/web/src/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if ((pathname.startsWith("/admin") || pathname.startsWith("/my-account")) && !user) {
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/admin/:path*", "/my-account/:path*"],
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(web): auth middleware — redirect unauthenticated users from protected routes"
```

---

## Task 5: Auth Server Actions + Pages

**Files:**
- Create: `apps/web/src/app/auth/actions.ts`
- Create: `apps/web/src/app/auth/login/page.tsx`
- Create: `apps/web/src/app/auth/register/page.tsx`
- Create: `apps/web/src/app/auth/forgot-password/page.tsx`
- Create: `apps/web/src/app/auth/reset-password/page.tsx`
- Create: `apps/web/src/app/auth/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing tests for auth actions**

`apps/web/src/app/auth/__tests__/actions.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Supabase server client
const mockSignIn = vi.fn()
const mockSignUp = vi.fn()
const mockResetPassword = vi.fn()
const mockSignOut = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      resetPasswordForEmail: mockResetPassword,
      signOut: mockSignOut,
    },
  }),
}))

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

const { loginAction, registerAction, forgotPasswordAction } = await import("../actions")

describe("loginAction", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns error for invalid email", async () => {
    const fd = new FormData()
    fd.set("email", "not-an-email")
    fd.set("password", "password123")
    const result = await loginAction(null, fd)
    expect(result?.error).toBeTruthy()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it("returns error when Supabase auth fails", async () => {
    mockSignIn.mockResolvedValue({ error: { message: "Invalid credentials" } })
    const fd = new FormData()
    fd.set("email", "user@example.com")
    fd.set("password", "password123")
    const result = await loginAction(null, fd)
    expect(result?.error).toBe("Invalid credentials")
  })

  it("calls signInWithPassword with correct credentials", async () => {
    mockSignIn.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set("email", "user@example.com")
    fd.set("password", "password123")
    await loginAction(null, fd).catch(() => {}) // redirect throws in test
    expect(mockSignIn).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    })
  })
})

describe("registerAction", () => {
  it("returns error for short password", async () => {
    const fd = new FormData()
    fd.set("email", "user@example.com")
    fd.set("password", "short")
    fd.set("displayName", "Test User")
    const result = await registerAction(null, fd)
    expect(result?.error).toBeTruthy()
  })
})

describe("forgotPasswordAction", () => {
  it("returns error when email missing", async () => {
    const result = await forgotPasswordAction(null, new FormData())
    expect(result?.error).toBeTruthy()
  })

  it("returns success message on valid email", async () => {
    mockResetPassword.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set("email", "user@example.com")
    const result = await forgotPasswordAction(null, fd)
    expect(result?.success).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web
npx vitest run src/app/auth/__tests__/actions.test.ts
```
Expected: FAIL — "Cannot find module ../actions"

- [ ] **Step 3: Write auth Server Actions**

`apps/web/src/app/auth/actions.ts`:
```typescript
"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { z } from "zod"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: "請填入有效的 Email 和密碼（至少 8 字元）" }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: error.message }

  redirect("/my-account")
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().min(1),
  }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  })
  if (!parsed.success) return { error: "請確認所有欄位填寫正確" }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  })
  if (error) return { error: error.message }

  redirect("/my-account")
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = formData.get("email")?.toString()
  if (!email) return { error: "請輸入 Email" }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
  })
  if (error) return { error: error.message }

  return { success: "重設密碼連結已寄出，請檢查您的信箱" }
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/app/auth/__tests__/actions.test.ts
```
Expected: 6 tests PASS

- [ ] **Step 5: Write login page**

`apps/web/src/app/auth/login/page.tsx`:
```typescript
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loginAction } from "../actions"
import Link from "next/link"

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null)

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>登入</CardTitle></CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "登入中…" : "登入"}
            </Button>
          </form>
          <div className="mt-4 flex justify-between text-sm">
            <Link href="/auth/register" className="text-muted-foreground hover:underline">
              建立帳號
            </Link>
            <Link href="/auth/forgot-password" className="text-muted-foreground hover:underline">
              忘記密碼
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Write register page**

`apps/web/src/app/auth/register/page.tsx`:
```typescript
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { registerAction } from "../actions"
import Link from "next/link"

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, null)

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>建立帳號</CardTitle></CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">姓名</Label>
              <Input id="displayName" name="displayName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼（至少 8 字元）</Label>
              <Input id="password" name="password" type="password" minLength={8} required />
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "建立中…" : "建立帳號"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link href="/auth/login" className="text-muted-foreground hover:underline">
              已有帳號？登入
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 7: Write forgot-password page**

`apps/web/src/app/auth/forgot-password/page.tsx`:
```typescript
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { forgotPasswordAction } from "../actions"

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, null)

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>重設密碼</CardTitle></CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "寄送中…" : "寄送重設連結"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 8: Write reset-password page**

`apps/web/src/app/auth/reset-password/page.tsx`:
```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError("密碼至少需要 8 個字元")
      return
    }
    setIsPending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setIsPending(false)
    if (error) { setError(error.message); return }
    router.push("/my-account")
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>設定新密碼</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">新密碼（至少 8 字元）</Label>
              <Input
                id="password" type="password" minLength={8} required
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "更新中…" : "更新密碼"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/auth
git commit -m "feat(web): auth pages — login, register, forgot/reset password with Server Actions"
```

---

## Task 6: Railway API Skeleton

**Files:**
- Create: `apps/api/src/app.ts` (Express app, no listen — testable)
- Create: `apps/api/src/index.ts` (entry, calls listen)
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/middleware/admin.ts`
- Create: `apps/api/src/middleware/internal.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/lib/supabase.ts`
- Create: `apps/api/vitest.config.ts`

- [ ] **Step 1: Setup apps/api**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npm init -y
npm install express @supabase/supabase-js zod pino pino-pretty
npm install --save-dev @types/express @types/node tsx typescript vitest supertest @types/supertest
```

- [ ] **Step 2: Write tsconfig.json**

`apps/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "CommonJS",
    "outDir": "dist", "rootDir": "src",
    "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

`apps/api/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    env: {
      SUPABASE_URL: "http://localhost:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      INTERNAL_API_SECRET: "test-internal-secret",
    },
  },
})
```

- [ ] **Step 4: Write Supabase service client**

`apps/api/src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js"

export const supabase = createClient(
  process.env.SUPABASE_URL ?? "http://localhost:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-key",
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

- [ ] **Step 5: Write failing tests for middleware**

`apps/api/src/middleware/__tests__/middleware.test.ts`:
```typescript
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
```

- [ ] **Step 6: Run middleware tests — expect FAIL**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api
npx vitest run src/middleware/__tests__/middleware.test.ts
```
Expected: FAIL — "Cannot find module ../auth"

- [ ] **Step 7: Write middleware implementations**

`apps/api/src/middleware/auth.ts`:
```typescript
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
```

`apps/api/src/middleware/admin.ts`:
```typescript
import type { Request, Response, NextFunction } from "express"
import { supabase } from "../lib/supabase"

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = res.locals.userId as string | undefined
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return }

  const { data } = await supabase
    .from("user_profiles").select("role").eq("user_id", userId).single()

  if (data?.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return }
  next()
}
```

`apps/api/src/middleware/internal.ts`:
```typescript
import type { Request, Response, NextFunction } from "express"

export function requireInternal(req: Request, res: Response, next: NextFunction) {
  if (req.headers["x-internal-secret"] !== process.env.INTERNAL_API_SECRET) {
    res.status(401).json({ error: "Unauthorized" }); return
  }
  next()
}
```

- [ ] **Step 8: Run middleware tests — expect PASS**

```bash
npx vitest run src/middleware/__tests__/middleware.test.ts
```
Expected: 7 tests PASS

- [ ] **Step 9: Write health route test**

`apps/api/src/routes/__tests__/health.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import request from "supertest"
import { app } from "../../app"

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
    expect(res.body.timestamp).toBeDefined()
  })
})
```

- [ ] **Step 10: Run health test — expect FAIL**

```bash
npx vitest run src/routes/__tests__/health.test.ts
```
Expected: FAIL — "Cannot find module ../../app"

- [ ] **Step 11: Write health route and Express app**

`apps/api/src/routes/health.ts`:
```typescript
import { Router } from "express"
const router = Router()
router.get("/", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})
export default router
```

`apps/api/src/app.ts`:
```typescript
import express from "express"
import healthRouter from "./routes/health"

export const app = express()
app.use(express.json())
app.use("/health", healthRouter)
app.use((_req, res) => { res.status(404).json({ error: "Not found" }) })
```

`apps/api/src/index.ts`:
```typescript
import pino from "pino"
import { app } from "./app"

const logger = pino({
  transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
})

const PORT = Number(process.env.PORT ?? 4000)
app.listen(PORT, () => logger.info({ port: PORT }, "API server started"))
```

- [ ] **Step 12: Run all API tests — expect PASS**

```bash
npx vitest run
```
Expected: 8 tests PASS (7 middleware + 1 health)

- [ ] **Step 13: Add scripts to package.json and commit**

In `apps/api/package.json`:
```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "test": "vitest run",
  "seed:admin": "tsx scripts/seed-admin.ts"
}
```

```bash
git add apps/api
git commit -m "feat(api): Railway Express API skeleton — app/index split, middleware with tests"
```

---

## Task 7: Supabase Database Schema (packages/db)

**Files:**
- Create: `packages/db/` (full package)
- Create: `packages/db/migrations/0001_initial.sql`

- [ ] **Step 1: Setup packages/db**

```bash
cd /Users/cataholic/Desktop/airport/realreal/packages/db
npm init -y
npm install drizzle-orm @supabase/supabase-js
npm install --save-dev drizzle-kit tsx typescript
```

- [ ] **Step 2: Write users schema**

`packages/db/src/schema/users.ts`:
```typescript
import { pgTable, uuid, text, numeric, integer, timestamp, date, jsonb } from "drizzle-orm/pg-core"

export const membershipTiers = pgTable("membership_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  minSpend: numeric("min_spend", { precision: 10, scale: 2 }).notNull().default("0"),
  discountRate: numeric("discount_rate", { precision: 5, scale: 4 }).notNull().default("0"),
  benefits: jsonb("benefits"),
  sortOrder: integer("sort_order").notNull().default(0),
})

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id").primaryKey(),
  displayName: text("display_name"),
  phone: text("phone"),
  birthday: date("birthday"),
  taxId: text("tax_id"),
  totalSpend: numeric("total_spend", { precision: 12, scale: 2 }).notNull().default("0"),
  membershipTierId: uuid("membership_tier_id"),
  role: text("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Write products schema**

`packages/db/src/schema/products.ts`:
```typescript
import { pgTable, uuid, text, boolean, numeric, integer, timestamp, jsonb } from "drizzle-orm/pg-core"

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
})

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  categoryId: uuid("category_id"),
  images: jsonb("images").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull(),
  sku: text("sku"),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
  stockQty: integer("stock_qty").notNull().default(0),
  weight: numeric("weight", { precision: 8, scale: 3 }),
  // e.g. { "flavor": "草莓", "weight_g": 50, "unit": "包" }
  attributes: jsonb("attributes").$type<Record<string, string | number>>(),
})
```

- [ ] **Step 4: Write orders schema**

`packages/db/src/schema/orders.ts`:
```typescript
import { pgTable, uuid, text, numeric, integer, timestamp, jsonb } from "drizzle-orm/pg-core"

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  userId: uuid("user_id"),
  guestEmail: text("guest_email"),
  status: text("status").notNull().default("pending"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  shippingMethod: text("shipping_method"),
  invoiceId: uuid("invoice_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  variantId: uuid("variant_id"),
  productSnapshot: jsonb("product_snapshot").notNull(),
  qty: integer("qty").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
})

export const orderAddresses = pgTable("order_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  addressType: text("address_type").notNull(),
  cvsStoreId: text("cvs_store_id"),
  cvsType: text("cvs_type"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
})
```

- [ ] **Step 5: Write payments + logistics + invoices schema**

`packages/db/src/schema/payments.ts`:
```typescript
import { pgTable, uuid, text, numeric, timestamp, jsonb, unique } from "drizzle-orm/pg-core"

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  gateway: text("gateway").notNull(),
  gatewayTxId: text("gateway_tx_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  rawResponse: jsonb("raw_response"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const logistics = pgTable("logistics", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  provider: text("provider").notNull().default("ecpay"),
  type: text("type").notNull(),
  ecpayLogisticsId: text("ecpay_logistics_id"),
  trackingNumber: text("tracking_number"),
  cvsPaymentNo: text("cvs_payment_no"),
  cvsValidationNo: text("cvs_validation_no"),
  status: text("status").notNull().default("pending"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  rawResponse: jsonb("raw_response"),
})

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  gateway: text("gateway").notNull(),
  merchantTradeNo: text("merchant_trade_no").notNull(),
  payload: jsonb("payload"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.gateway, t.merchantTradeNo),
}))

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  invoiceNumber: text("invoice_number"),
  type: text("type").notNull(),
  taxId: text("tax_id"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  amegoId: text("amego_id"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
})
```

- [ ] **Step 6: Write subscription + coupon schema**

`packages/db/src/schema/subscriptions.ts`:
```typescript
import { pgTable, uuid, text, numeric, integer, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core"

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  interval: text("interval").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  variantId: uuid("variant_id"),
  qty: integer("qty"),
  benefits: jsonb("benefits"),
  isActive: boolean("is_active").notNull().default(true),
})

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  planId: uuid("plan_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("active"),
  paymentMethod: text("payment_method").notNull().default("pchomepay"),
  paymentMethodToken: text("payment_method_token"),   // AES-256 encrypted
  tokenKeyVersion: integer("token_key_version").notNull().default(1),
  retryCount: integer("retry_count").notNull().default(0),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  nextBillingDate: date("next_billing_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const subscriptionOrders = pgTable("subscription_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").notNull(),
  orderId: uuid("order_id"),
  billingCycle: integer("billing_cycle").notNull(), // auto-increment from 1
  idempotencyKey: text("idempotency_key").notNull().unique(), // sub_{id}_{YYYY-MM-DD}
  status: text("status").notNull().default("pending"),
})

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  minOrder: numeric("min_order", { precision: 10, scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  applicableTo: text("applicable_to").notNull().default("order"),
})

export const couponUses = pgTable("coupon_uses", {
  id: uuid("id").primaryKey().defaultRandom(),
  couponId: uuid("coupon_id").notNull(),
  userId: uuid("user_id"),
  orderId: uuid("order_id"),
  subscriptionId: uuid("subscription_id"),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 7: Write packages/db index**

`packages/db/src/index.ts`:
```typescript
export * from "./schema/users"
export * from "./schema/products"
export * from "./schema/orders"
export * from "./schema/payments"
export * from "./schema/subscriptions"
```

`packages/db/package.json`:
```json
{
  "name": "@realreal/db",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "drizzle-orm": "^0.36", "@supabase/supabase-js": "^2" },
  "devDependencies": { "drizzle-kit": "^0.28", "tsx": "^4", "typescript": "^5" }
}
```

- [ ] **Step 8: Write initial migration SQL**

`packages/db/migrations/0001_initial.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE membership_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  benefits JSONB,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  birthday DATE,
  tax_id TEXT,
  total_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  membership_tier_id UUID REFERENCES membership_tiers(id),
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES categories(id),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  images JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  sale_price NUMERIC(10,2),
  stock_qty INT NOT NULL DEFAULT 0,
  weight NUMERIC(8,3),
  attributes JSONB
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  guest_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','shipped','completed','cancelled','failed')),
  subtotal NUMERIC(10,2) NOT NULL,
  shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('pchomepay','linepay','jkopay')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','failed','refunded')),
  shipping_method TEXT CHECK (shipping_method IN ('cvs_711','cvs_family','home_delivery')),
  invoice_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id),
  product_snapshot JSONB NOT NULL,
  qty INT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL
);

CREATE TABLE order_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('billing','shipping')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address_type TEXT NOT NULL CHECK (address_type IN ('home','cvs')),
  cvs_store_id TEXT,
  cvs_type TEXT CHECK (cvs_type IN ('711','family')),
  address TEXT,
  city TEXT,
  postal_code TEXT
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  gateway TEXT NOT NULL,
  gateway_tx_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_response JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE logistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL DEFAULT 'ecpay',
  type TEXT NOT NULL,
  ecpay_logistics_id TEXT,
  tracking_number TEXT,
  cvs_payment_no TEXT,
  cvs_validation_no TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  raw_response JSONB
);

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL,
  merchant_trade_no TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gateway, merchant_trade_no)
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  invoice_number TEXT,
  type TEXT NOT NULL CHECK (type IN ('B2C_2','B2C_3','B2B')),
  tax_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','issued','voided')),
  amego_id TEXT,
  issued_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ
);

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('membership','replenishment')),
  interval TEXT NOT NULL CHECK (interval IN ('monthly','bimonthly')),
  price NUMERIC(10,2) NOT NULL,
  variant_id UUID REFERENCES product_variants(id),
  qty INT,
  benefits JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','cancelled','past_due')),
  payment_method TEXT NOT NULL DEFAULT 'pchomepay',
  payment_method_token TEXT,
  token_key_version INT NOT NULL DEFAULT 1,
  retry_count INT NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  order_id UUID REFERENCES orders(id),
  billing_cycle INT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('percentage','fixed')),
  value NUMERIC(10,2) NOT NULL,
  min_order NUMERIC(10,2),
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  applicable_to TEXT NOT NULL DEFAULT 'order'
    CHECK (applicable_to IN ('order','subscription','both'))
);

CREATE TABLE coupon_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id),
  user_id UUID REFERENCES auth.users(id),
  order_id UUID REFERENCES orders(id),
  subscription_id UUID REFERENCES subscriptions(id),
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO membership_tiers (name, min_spend, discount_rate, sort_order) VALUES
  ('一般會員', 0, 0, 1),
  ('銀卡會員', 3000, 0.03, 2),
  ('金卡會員', 10000, 0.05, 3),
  ('鑽石會員', 30000, 0.08, 4);
```

- [ ] **Step 9: Apply migration in Supabase SQL Editor**

Paste `0001_initial.sql` into Supabase Dashboard → SQL Editor → Run
Expected: "Success. No rows returned"

- [ ] **Step 10: Commit**

```bash
git add packages/db
git commit -m "feat(db): Drizzle schema (jsonb columns) and initial SQL migration"
```

---

## Task 8: Admin Seed Script

**Files:**
- Create: `apps/api/scripts/seed-admin.ts`

- [ ] **Step 1: Write seed script**

`apps/api/scripts/seed-admin.ts`:
```typescript
import { createClient } from "@supabase/supabase-js"

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
  console.error("❌ Refusing to seed in production. Set ALLOW_SEED=true to override.")
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("❌ Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars")
  process.exit(1)
}

async function seedAdmin() {
  const { data: existing } = await supabase.auth.admin.listUsers()
  if (existing?.users?.find(u => u.email === ADMIN_EMAIL)) {
    console.log(`✓ Admin ${ADMIN_EMAIL} already exists — skipping`)
    return
  }

  const { data: { user }, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true,
  })
  if (error || !user) { console.error("❌", error?.message); process.exit(1) }

  const { error: profileError } = await supabase
    .from("user_profiles")
    .upsert({ user_id: user.id, display_name: "Admin", role: "admin" })
  if (profileError) { console.error("❌", profileError.message); process.exit(1) }

  console.log(`✓ Admin created: ${ADMIN_EMAIL}`)
}

seedAdmin()
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/scripts
git commit -m "feat(api): idempotent admin seed script with production guard"
```

---

## Task 9: Integration Smoke Test

- [ ] **Step 1: Start Railway API**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npm run dev
```
Expected: "API server started" on port 4000

- [ ] **Step 2: Verify health endpoint**

```bash
curl http://localhost:4000/health
```
Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 3: Start Next.js**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npm run dev
```
Expected: Ready on `http://localhost:3000`

- [ ] **Step 4: Verify homepage**

Open `http://localhost:3000` — expect "誠真生活 RealReal"

- [ ] **Step 5: Verify auth pages**

Open `http://localhost:3000/auth/login` — expect login form with email/password fields

- [ ] **Step 6: Verify middleware redirects**

Open `http://localhost:3000/my-account` — expect redirect to `/auth/login`
Open `http://localhost:3000/admin` — expect redirect to `/auth/login`

- [ ] **Step 7: Run all tests**

```bash
cd /Users/cataholic/Desktop/airport/realreal
npx turbo test
```
Expected: All tests PASS (web + api)

- [ ] **Step 8: TypeScript check all packages**

```bash
cd /Users/cataholic/Desktop/airport/realreal/apps/web && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/apps/api && npx tsc --noEmit
cd /Users/cataholic/Desktop/airport/realreal/packages/db && npx tsc --noEmit
```
Expected: No errors in any package

---

## Definition of Done

- [ ] `turbo dev` starts both web (port 3000) and api (port 4000)
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] Homepage renders at `http://localhost:3000`
- [ ] Login, register, forgot-password, reset-password pages render
- [ ] Unauthenticated `/my-account` and `/admin` redirect to `/auth/login`
- [ ] Supabase migration applied — all tables exist in dashboard
- [ ] `npx turbo test` — all tests PASS
- [ ] `tsc --noEmit` — zero errors in all 3 packages (web, api, db)
- [ ] Admin seed script runs idempotently: `SEED_ADMIN_EMAIL=x SEED_ADMIN_PASSWORD=y npm run seed:admin`
