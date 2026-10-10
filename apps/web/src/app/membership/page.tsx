import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { MEMBERSHIP_FAQ, PARA_BREAK } from "./_faq"

export const metadata: Metadata = {
  title: "會員制度 | 誠真生活 RealReal",
  description:
    "了解誠真生活 RealReal 會員制度，從初心之友到同心之友，享受專屬折扣、公益存款與生日禮遇。",
}

// 2026-10-10 換成新版兩張。順序是先「為什麼」再「比什麼」——旅程圖講制度的
// 用意與三個階段，比較表才是細節；反過來放的話，一打開就是一張密密麻麻的表。
const membershipImages = [
  {
    src: "https://fornopjdqwtexqfedhqv.supabase.co/storage/v1/object/public/product-images/membership/journey-1791615415819.png",
    alt: "誠真生活會員旅程：加入初心之友、成為知心之友、受邀成為同心之友",
    width: 1800,
    height: 1350,
  },
  {
    src: "https://fornopjdqwtexqfedhqv.supabase.co/storage/v1/object/public/product-images/membership/compare-1791616510359.png",
    alt: "會員等級比較：初心之友、知心之友、同心之友的專屬禮遇與加入方式",
    width: 1800,
    height: 1350,
  },
]

export default function MembershipPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-10 text-center text-[#10305a]">
        會員制度
      </h1>

      {/* Membership tier images from WordPress */}
      <div className="space-y-6 mb-12">
        {membershipImages.map((img) => (
          <Image
            key={img.src}
            src={img.src}
            alt={img.alt}
            width={img.width}
            height={img.height}
            className="w-full h-auto rounded-[10px]"
            unoptimized
          />
        ))}
      </div>

      {/* CTA */}
      <div className="text-center mb-12">
        <Link
          href="/auth/register"
          className="inline-block rounded-full bg-[#10305a] px-8 py-3 text-white font-semibold hover:bg-[#10305a]/90 transition-colors"
        >
          開啟旅程
        </Link>
      </div>

      {/* Notes */}
      <div className="mb-12 text-sm text-[#687279] space-y-1">
        <p>
          <strong className="text-[#10305a]">*</strong>{" "}
          公益存款按實際消費金額扣除運費後計算
        </p>
        <p>
          <strong className="text-[#10305a]">*</strong>{" "}
          記得於會員資料中填寫生日，才能收到專屬生日禮喔
        </p>
      </div>

      {/* 分享回報入口 —— 制度表最下面那排「怎麼走得更近」講的就是這些事，
          看完想做的人應該在同一個畫面就找得到入口，不用去翻會員中心。 */}
      <div className="mb-12 rounded-lg border border-[#10305a]/15 bg-[#10305a]/5 p-6 text-center">
        <p className="mb-1 font-semibold text-[#10305a]">分享過了嗎？</p>
        <p className="mb-4 text-sm text-[#687279]">
          貼上連結或傳張截圖就好，我們看過會通知你。
        </p>
        <Link
          href="/share"
          className="inline-block rounded-full border border-[#10305a] px-6 py-2 font-semibold text-[#10305a] transition-colors hover:bg-[#10305a] hover:text-white"
        >
          分享我的心得
        </Link>
      </div>

      {/* 常見問題 */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-[#10305a] text-center">常見問題</h2>
        <div className="divide-y divide-[#10305a]/10 border-t border-b border-[#10305a]/10">
          {MEMBERSHIP_FAQ.filter((item) => !item.comingSoon).map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-start gap-3 font-semibold text-[#10305a]">
                <span className="mt-0.5 shrink-0 transition-transform group-open:rotate-90">›</span>
                <span>{item.q}</span>
              </summary>
              <div className="mt-3 pl-6 space-y-3 text-[#687279] leading-relaxed">
                {item.a.split(PARA_BREAK).map((para) => (
                  <p
                    key={para}
                    className="whitespace-pre-line [&_a]:text-[#10305a] [&_a]:underline [&_a]:underline-offset-2"
                    dangerouslySetInnerHTML={{ __html: para }}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
