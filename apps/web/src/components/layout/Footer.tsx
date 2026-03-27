import Link from "next/link"

const FOOTER_LINKS = [
  {
    title: "商品",
    links: [
      { href: "/shop", label: "全部商品" },
      { href: "/subscribe", label: "訂閱方案" },
    ],
  },
  {
    title: "會員",
    links: [
      { href: "/my-account", label: "我的帳戶" },
      { href: "/my-account/orders", label: "我的訂單" },
      { href: "/my-account/membership", label: "會員權益" },
    ],
  },
  {
    title: "關於",
    links: [
      { href: "/about", label: "關於我們" },
      { href: "/contact", label: "聯絡我們" },
      { href: "/faq", label: "常見問題" },
    ],
  },
  {
    title: "政策",
    links: [
      { href: "/privacy", label: "隱私權政策" },
      { href: "/terms", label: "服務條款" },
      { href: "/shipping", label: "配送說明" },
      { href: "/returns", label: "退換貨政策" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t bg-zinc-50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-lg font-bold text-green-700">誠真生活</p>
            <p className="text-xs text-zinc-400">RealReal</p>
            <p className="mt-3 text-sm text-zinc-500">
              純淨植物力，為你的健康加分。台灣在地純素健康食品品牌。
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map((group) => (
            <div key={group.title}>
              <p className="mb-3 text-sm font-semibold text-zinc-900">{group.title}</p>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-zinc-500 transition-colors hover:text-zinc-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t pt-6 text-center text-xs text-zinc-400">
          © {new Date().getFullYear()} 誠真生活 RealReal. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
