import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "登入",
  description: "登入您的誠真生活 RealReal 帳號，管理訂單與訂閱。",
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
