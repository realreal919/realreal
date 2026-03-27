import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "關於我們 | 誠真生活 RealReal",
  description:
    "誠真生活是台灣在地的純素保健食品品牌，堅持以純淨原料與科學配方，為您帶來誠真健康。",
}

const values = [
  {
    title: "純淨原料",
    description: "嚴選天然植物來源，不添加人工色素、香料與防腐劑，每一口都安心。",
  },
  {
    title: "科學配方",
    description: "與營養學專家合作研發，以實證科學為基礎，精準調配最佳比例。",
  },
  {
    title: "永續包裝",
    description: "採用可回收與低碳排包材，從產地到餐桌，減少對環境的負擔。",
  },
  {
    title: "在地生產",
    description: "全程台灣製造，支持在地農業與產業鏈，新鮮直送不繞路。",
  },
]

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      {/* Hero */}
      <section className="text-center mb-16">
        <h1 className="text-3xl font-bold mb-4 text-[#10305a]">關於誠真生活</h1>
        <p className="text-lg text-[#687279]">純粹投入，誠真健康</p>
      </section>

      {/* Brand Story */}
      <section className="mb-16">
        <h2 className="text-xl font-semibold mb-4 text-[#10305a]">品牌故事</h2>
        <div className="space-y-4 text-[#687279] leading-relaxed">
          <p>
            誠真生活 RealReal
            是一個源自台灣的純素保健食品品牌。我們相信，真正的健康來自大自然最純粹的力量。從一顆種子到一份產品，我們以「誠」為本、以「真」為念，堅持提供最純淨的植物性營養。
          </p>
          <p>
            在加工食品充斥的時代，我們選擇回歸本質。每一款產品都經過嚴謹的科學研發，確保營養成分的有效性與安全性。我們不只是做產品，更是在推動一種對自己、對地球都更友善的生活方式。
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="mb-16">
        <h2 className="text-xl font-semibold mb-4 text-[#10305a]">品牌使命</h2>
        <div className="rounded-lg p-6 bg-[#10305a]">
          <p className="text-white leading-relaxed">
            我們致力於以植物的力量，為每個人帶來簡單、有效且永續的健康方案。透過科學驗證的純素配方，讓健康飲食不再是妥協，而是一種享受。
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="mb-16">
        <h2 className="text-xl font-semibold mb-6 text-[#10305a]">核心價值</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {values.map((v) => (
            <div key={v.title} className="bg-[#fffeee] border-none rounded-lg p-5">
              <h3 className="font-semibold mb-2 text-[#10305a]">{v.title}</h3>
              <p className="text-sm text-[#687279] leading-relaxed">
                {v.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Team Placeholder */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-[#10305a]">團隊介紹</h2>
        <div className="border rounded-lg p-8 text-center text-zinc-400">
          <p>團隊資訊即將上線，敬請期待。</p>
        </div>
      </section>
    </div>
  )
}
