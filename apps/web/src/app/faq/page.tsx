import type { Metadata } from "next"
import { getSiteContent } from "@/lib/content"

export const metadata: Metadata = {
  title: "常見問題 | 誠真生活 RealReal",
  description: "關於誠真生活的訂購流程、配送方式、退換貨政策、訂閱制度等常見問題。",
}

type FaqItem = { q: string; a: string }

type FaqSection = {
  title: string
  items: FaqItem[]
}

const hardcodedSections: FaqSection[] = [
  {
    title: "訂購流程",
    items: [
      {
        q: "如何下單購買？",
        a: "您可以在商品頁面選擇想要的品項與數量，加入購物車後進入結帳流程，填寫收件資訊與付款方式即可完成訂購。",
      },
      {
        q: "可以使用哪些付款方式？",
        a: "目前支援信用卡（Visa / Mastercard / JCB）、LINE Pay 及貨到付款。",
      },
      {
        q: "下單後可以修改訂單嗎？",
        a: "訂單成立後 30 分鐘內可透過「我的帳戶 > 訂單紀錄」自行修改。超過時間請聯繫客服協助處理。",
      },
    ],
  },
  {
    title: "配送方式",
    items: [
      {
        q: "有哪些配送方式？",
        a: "提供宅配到府（黑貓宅急便）、7-11 超商取貨及全家超商取貨三種方式。",
      },
      {
        q: "配送需要多久？",
        a: "一般訂單於付款完成後 1–3 個工作日出貨，宅配約 1–2 天送達，超商取貨約 2–3 天到店。",
      },
      {
        q: "運費如何計算？",
        a: "單筆訂單滿 NT$800 免運費。未達免運門檻，宅配運費 NT$100，超商取貨運費 NT$60。",
      },
    ],
  },
  {
    title: "退換貨政策",
    items: [
      {
        q: "收到商品後可以退貨嗎？",
        a: "依照消費者保護法，您享有收到商品後 7 天的鑑賞期。商品未拆封且保持完整包裝即可申請退貨。",
      },
      {
        q: "如何申請退換貨？",
        a: "請至「我的帳戶 > 訂單紀錄」選擇需退換貨的訂單，填寫退換貨原因後送出申請，客服將於 1 個工作日內回覆。",
      },
      {
        q: "退款多久會入帳？",
        a: "退貨商品經確認無誤後，信用卡退款約 7–14 個工作日入帳，LINE Pay 約 3–5 個工作日。",
      },
    ],
  },
  {
    title: "訂閱制度",
    items: [
      {
        q: "訂閱方案有什麼好處？",
        a: "訂閱用戶可享有專屬折扣（最高 85 折）、免運費、優先出貨及不定期會員禮等多項福利。",
      },
      {
        q: "訂閱可以隨時取消嗎？",
        a: "可以。您可以在下次扣款日前 3 天，至「我的帳戶 > 訂閱管理」取消訂閱，不會收取任何違約金。",
      },
      {
        q: "訂閱的配送頻率可以調整嗎？",
        a: "可以。目前提供每月及每雙月兩種頻率，您可以在訂閱管理頁面隨時切換。",
      },
    ],
  },
  {
    title: "會員權益",
    items: [
      {
        q: "如何成為會員？",
        a: "在官網完成註冊即可成為一般會員，享有基本會員權益。消費累積達一定金額可自動升級。",
      },
      {
        q: "會員等級有哪些？",
        a: "目前分為一般會員、銀卡會員（累計消費滿 NT$3,000）及金卡會員（累計消費滿 NT$10,000），各等級享有不同折扣與專屬活動。",
      },
    ],
  },
  {
    title: "純素認證",
    items: [
      {
        q: "產品真的是純素的嗎？",
        a: "是的。我們所有產品皆為 100% 植物性配方，不含任何動物成分，並通過第三方純素認證。",
      },
      {
        q: "產品有通過哪些檢驗？",
        a: "所有產品皆通過 SGS 檢驗，符合台灣食品安全法規，並取得 ISO 22000 與 HACCP 認證工廠生產。",
      },
    ],
  },
]

export default async function FaqPage() {
  // Try fetching dynamic FAQ items from the API
  const dynamicItems = await getSiteContent<FaqSection[]>("faq_items")
  const sections =
    Array.isArray(dynamicItems) && dynamicItems.length > 0
      ? dynamicItems
      : hardcodedSections

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2 text-center text-[#10305a]">常見問題</h1>
      <p className="text-[#687279] text-center mb-10">
        找不到答案？歡迎透過聯絡頁面與我們聯繫
      </p>

      <div className="space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold mb-4 border-b pb-2 text-[#10305a]">
              {section.title}
            </h2>
            <div className="space-y-2">
              {section.items.map((item) => (
                <details
                  key={item.q}
                  className="group border rounded-lg bg-[#fffeee]"
                >
                  <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-medium text-sm text-[#10305a] hover:bg-[#fffeee]/80 transition-colors">
                    <span>{item.q}</span>
                    <span className="ml-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="px-4 pb-4 text-sm text-[#687279] leading-relaxed">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
