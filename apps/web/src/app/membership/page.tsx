import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { MEMBERSHIP_FAQ, PARA_BREAK } from "./_faq"

export const metadata: Metadata = {
  title: "會員制度 | 誠真生活 RealReal",
  description:
    "了解誠真生活 RealReal 會員制度，從初心之友到同心之友，享受專屬折扣、公益存款與生日禮遇。",
}

const membershipImages = [
  {
    src: "https://fornopjdqwtexqfedhqv.supabase.co/storage/v1/object/public/product-images/membership/675b76e81af03e313ae5e5cd98fe2ed6.jpg",
    alt: "會員制度表",
    width: 1800,
    height: 1350,
  },
  {
    src: "/brand/membership-table.png",
    alt: "會員制度表",
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
