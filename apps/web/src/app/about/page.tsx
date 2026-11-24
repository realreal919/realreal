import type { Metadata } from "next"
import Image from "next/image"
import { getSiteContent } from "@/lib/content"

export const metadata: Metadata = {
  title: "品牌故事 | 誠真生活 RealReal",
  description:
    "誠真生活是台灣在地的純素保健食品品牌，堅持以純淨原料與科學配方，為您帶來誠真健康。",
}

type AboutContent = {
  content_html?: string
}

const promises = [
  "合作工廠通過 HACCP 與 ISO22000 品質認證",
  "產品經第三方檢驗機構把關",
  "商品投保產品責任險",
  "持續分享實用、易懂的健康知識",
]

/**
 * 品牌故事／願景（2026-11-24 全文改版，店主給的定稿）。
 *
 * 排版的層次刻意分成四層，不要再把所有段落壓成同一種灰色小字：
 *   1. 開場的業界對話 —— 整段拉出來當引言，它是整個故事的起點，不是內文。
 *   2. 敘事段 —— 正文灰 (#687279)，行距放寬。
 *   3. 三個「選擇」—— 左側細線的宣言區塊，一行一個，讓讀者慢下來。
 *   4. 收尾句 —— 放大、深藍，一頁只有一句話是這個份量。
 * 願景區塊同理，最後的 Live like a child. 用字距拉開當結語落款。
 */
export default async function AboutPage() {
  const content = await getSiteContent<AboutContent>("about_page")
  const hasCustomContent = content?.content_html && content.content_html.trim().length > 0

  if (hasCustomContent) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div
          className="prose prose-zinc max-w-none
            prose-headings:text-[#10305a] prose-headings:font-bold
            prose-p:text-[#687279] prose-p:leading-relaxed
            prose-a:text-[#10305a] prose-a:underline
            prose-img:rounded-[10px] prose-img:mx-auto
            prose-li:text-[#687279]
            prose-blockquote:border-[#10305a]/30 prose-blockquote:text-[#687279]
            prose-strong:text-[#10305a]"
          dangerouslySetInnerHTML={{ __html: content!.content_html! }}
        />
      </div>
    )
  }

  return (
    <div className="bg-white">

      {/* ── 品牌故事 ── */}
      <section className="container mx-auto px-4 pt-16 pb-14">

        <div className="flex flex-col md:flex-row gap-10 md:gap-16 items-start">

          {/* 創辦人照片。桌機黏在側邊，讓長文往上捲時臉還在。 */}
          <div className="w-full md:w-[42%] flex-shrink-0 md:sticky md:top-24">
            <div className="relative rounded-2xl overflow-hidden shadow-md">
              <Image
                src="https://fornopjdqwtexqfedhqv.supabase.co/storage/v1/object/public/product-images/legacy-wp/be1b8ac6b1a9aa376218909be204e453.webp"
                alt="誠真生活創辦人"
                width={865}
                height={1024}
                sizes="(min-width: 768px) 42vw, 100vw"
                className="w-full h-auto object-cover"
                // Next 16 起 priority 已棄用，改用 preload（這張是本頁首屏的 LCP）
                preload
              />
            </div>
          </div>

          <div className="flex-1 min-w-0">

            <h2 className="text-2xl font-bold text-[#10305a]">
              品牌故事 <span className="font-normal text-[#a09080]">Our Story</span>
            </h2>

            {/* 開場：業界前輩的那段話。整個故事從這裡長出來，所以它不是內文的一部分。 */}
            <figure className="mt-7 mb-8 border-l-2 border-[#10305a]/25 pl-5">
              <blockquote className="text-lg md:text-xl leading-[2] text-[#10305a]">
                「食品業要賺錢啊，不是要做得好吃，就是要 CP 值高，所以就算我有能力做養生的東西，我也不敢做啊。」
              </blockquote>
              <figcaption className="mt-4 text-sm text-[#a09080]">
                —— 一場與食品業大老的對話
              </figcaption>
            </figure>

            <div className="space-y-5 text-[#687279] leading-[1.9]">
              <p>這番話讓我開始思考，也埋下了創辦誠真生活的種子。</p>
              <p>
                在乎健康、願意為自己的身體付諸行動的人，或許仍是市場上的少數。但如果市場始終沒有更多兼顧品質與價格的選擇，又要如何讓更多人開始實踐健康生活？
              </p>
              <p>
                不是每個人都有足夠的預算購買有機食品，也不是每個人都有時間與能力為自己料理一日三餐。
              </p>
              <p className="text-[#10305a] font-medium text-[1.0625rem]">
                難道想好好照顧自己，就只能在品質、價格與便利之間不斷妥協嗎？
              </p>
            </div>

            <hr className="my-8 border-zinc-200" />

            <div className="space-y-5 text-[#687279] leading-[1.9]">
              <p>我們相信，健康不該是一種奢侈，照顧自己也不該是一件複雜的事。</p>
              <p>我們希望，健康的生活方式，不只是少數人的選擇，而是更多人有能力實踐的日常。</p>
              <p>
                我們不確定，這樣逆著市場潮流的品牌能不能被看見，
                <span className="block mt-1 text-[#10305a]">但總是得先存在再說。</span>
              </p>
            </div>

            {/* 三個「選擇」：一行一個，左側細線把它們從敘事裡抬出來。 */}
            <div className="my-8 border-l-2 border-[#a09080]/50 pl-5 space-y-2">
              <p className="text-[#687279] leading-[1.9]">一個選擇更單純的成分、</p>
              <p className="text-[#687279] leading-[1.9]">選擇更真實的原料、</p>
              <p className="text-[#687279] leading-[1.9]">選擇更誠實地對待自己身體的品牌——</p>
              <p className="pt-2 text-lg font-semibold text-[#10305a]">「誠真生活」在這裡。</p>
            </div>

            <div className="space-y-5 text-[#687279] leading-[1.9]">
              <p>而我們想做的，不只是提供一份滋養身體的食物。</p>
              <p>
                我們更希望，當照顧自己變得簡單，生活也能多一點從容，讓我們有餘裕去感受美好、關心身邊的人，將得到的滋養化為給予他人的善意。
              </p>
            </div>

            {/* 收尾句：整個故事區塊只有這一句是這個份量。 */}
            {/* 比區塊標題（text-2xl）小一階：它是收尾句，不是另一個標題。 */}
            <p className="mt-8 text-lg md:text-xl font-semibold leading-[1.8] text-[#10305a]">
              從好好照顧自己開始，讓美好的事一點一點發生。
            </p>

            <hr className="my-8 border-zinc-200" />

            <p className="text-right text-sm text-[#a09080]">創辦人 尹昕</p>
          </div>
        </div>
      </section>

      {/* ── 品牌願景 ── */}
      <section className="border-t border-zinc-100 bg-[#fbfaf8] py-16">
        <div className="container mx-auto px-4 max-w-3xl">

          <h2 className="text-2xl font-bold text-[#10305a] text-center">
            品牌願景 <span className="font-normal text-[#a09080]">Our Vision</span>
          </h2>

          <h3 className="mt-8 mb-10 text-center text-lg md:text-xl font-semibold leading-[1.8] text-[#10305a]">
            願更多人在照顧自己的同時，<br className="sm:hidden" />也有餘裕照亮他人。
          </h3>

          <div className="mx-auto max-w-2xl space-y-5 text-center text-[#687279] leading-[1.9]">
            <p>我們相信，健康不只是身體的狀態，更是一種與自己、與世界相處的方式。</p>
            {/* 斷句是店主指定的（2026-11-24）。手機寬度放不下，讓它自然斷行就好。 */}
            <p>
              當身體得到滋養，內心有了餘裕，我們便更有力量去愛、去分享，
              <br className="hidden md:inline" />
              也去關懷那些需要幫助的人。
            </p>
            <p>
              誠真生活希望透過滋養身心的產品、知識與行動，降低實踐健康生活的門檻，
              <br className="hidden md:inline" />
              讓照顧自己與善待世界，成為可以同時存在的選擇。
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-2xl text-center space-y-3">
            <p className="text-[#10305a] leading-[1.9]">
              願我們在成長的過程中，依然保有如孩子般的純真、自在與善意。
            </p>
            <p className="text-[#10305a] font-medium leading-[1.9]">
              以更誠實的方式照顧自己，以更真誠的態度面對生活。
            </p>
          </div>

          {/* 英文標語當落款，字距拉開、前後留白，不要跟上一段黏在一起。 */}
          <p className="mt-10 text-center text-sm md:text-base tracking-[0.35em] text-[#a09080] uppercase">
            Live like a child.
          </p>

          <div className="relative mt-12 rounded-2xl overflow-hidden shadow-sm">
            <Image
              src="https://fornopjdqwtexqfedhqv.supabase.co/storage/v1/object/public/product-images/legacy-wp/d566e8c1fe0ef8d88d96d75a3428a6ab.webp"
              alt="品牌願景"
              width={1024}
              height={683}
              sizes="(min-width: 768px) 768px, 100vw"
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </section>

      {/* ── 品牌承諾 ── */}
      <section className="border-t border-zinc-100 py-16">
        <div className="container mx-auto px-4 max-w-3xl">

          <h2 className="text-2xl font-bold text-[#10305a] text-center mb-10">
            品牌承諾 <span className="font-normal text-[#a09080]">Our Promises</span>
          </h2>

          <ul className="space-y-4">
            {promises.map((item) => (
              <li key={item} className="flex items-center justify-center gap-3">
                <span className="text-[#10305a] font-bold text-lg leading-none">✓</span>
                <span className="text-[#687279]">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

    </div>
  )
}
