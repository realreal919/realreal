"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { registerAction } from "../actions"
import Link from "next/link"

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, null)

  useEffect(() => {
    if (state?.success) {
      toast.success("註冊成功")
    } else if (state?.error) {
      toast.error(state.error)
    }
  }, [state])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">誠真生活</h1>
          <p className="mt-1 text-sm text-muted-foreground">RealReal</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">建立帳號</CardTitle>
            <CardDescription>填寫以下資訊以建立您的帳號</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">姓名</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  placeholder="您的姓名"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">電子郵件</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密碼</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="至少 8 個字元"
                  minLength={8}
                  required
                />
              </div>
              {state?.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              {state?.success && (
                <p className="text-sm text-green-600">{state.success}</p>
              )}
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "建立中…" : "註冊"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              已有帳號？{" "}
              <Link
                href="/auth/login"
                className="font-medium text-primary hover:underline"
              >
                立即登入
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
