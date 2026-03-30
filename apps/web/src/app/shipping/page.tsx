import type { Metadata } from "next"
import { getSiteContent } from "@/lib/content"

export const metadata: Metadata = {
  title: "配送說明 | 誠真生活 RealReal",
  description: "誠真生活 RealReal 配送方式、運費及配送時間說明。",
}

const deliveryMethods = [
  {
    name: "宅配到府",
    provider: "宅配通",
    fee: "NT$150",
    freeThreshold: "單筆訂單滿 NT$999 免運",
    time: "付款後 2–5 個工作日出貨（不含例假日），到貨時間依物流公司為準",
    notes: [
      "離島地區配送時間可能較長",
      "如貨物尺寸超過超商取貨限制，將通知您改採用宅配",
    ],
  },
  {
    name: "7-11 超商取貨",
    provider: "統一超商",
    fee: "NT$65",
    freeThreshold: "單筆訂單滿 NT$499 免運",
    time: "付款後 2–5 個工作日出貨（不含例假日），到貨時間依物流公司為準",
    notes: [
      "包裹到店後將以簡訊通知取件",
      "請於到店通知後 7 天內前往取貨",
      "逾期未取將退回，運費不予退還",
      "如貨物尺寸超過超商取貨限制，將通知您改採用宅配",
    ],
  },
  {
    name: "全家超商取貨",
    provider: "全家便利商店",
    fee: "NT$65",
    freeThreshold: "單筆訂單滿 NT$499 免運",
    time: "付款後 2–5 個工作日出貨（不含例假日），到貨時間依物流公司為準",
    notes: [
      "包裹到店後將以簡訊通知取件",
      "請於到店通知後 7 天內前往取貨",
      "逾期未取將退回，運費不予退還",
      "如貨物尺寸超過超商取貨限制，將通知您改採用宅配",
    ],
  },
]

export default async function ShippingPage() {
  const content = await getSiteContent<{ content_html: string }>("shipping_policy")
  const hasCustomContent = content?.content_html && content.content_html.trim().length > 0

  if (hasCustomContent) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div
          className="prose prose-zinc max-w-none
            prose-headings:text-[#10305a] prose-headings:font-bold
            prose-p:text-[#687279] prose-p:leading-relaxed
            prose-a:text-[#10305a] prose-a:underline
            prose-img:rounded-[10px]
            prose-li:text-[#687279]
            prose-blockquote:border-[#10305a]/30 prose-blockquote:text-[#687279]
            prose-strong:text-[#10305a]"
          dangerouslySetInnerHTML={{ __html: content!.content_html! }}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2 text-center text-[#10305a]">配送說明</h1>
      <p className="text-[#687279] text-center mb-10">
        我們提供多種配送方式，讓您輕鬆收到商品
      </p>

      <div className="space-y-10">
        {/* 配送方式 */}
        <section>
          <h2 className="text-xl font-semibold mb-6 border-b pb-2 text-[#10305a]">
            配送方式
          </h2>
          <div className="space-y-6">
            {deliveryMethods.map((method) => (
              <div key={method.name} className="border rounded-lg p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg text-[#10305a]">{method.name}</h3>
                    <p className="text-sm text-zinc-500">{method.provider}</p>
                  </div>
                  <span className="text-sm font-medium bg-[#fffeee] text-[#10305a] px-3 py-1 rounded-full">
                    {method.fee}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-zinc-600">
                  <p>
                    <span className="font-medium text-[#10305a]">免運門檻：</span>
                    {method.freeThreshold}
                  </p>
                  <p>
                    <span className="font-medium text-[#10305a]">配送時間：</span>
                    {method.time}
                  </p>
                  <div>
                    <span className="font-medium text-[#10305a]">注意事項：</span>
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      {method.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 配送範圍 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            配送範圍
          </h2>
          <div className="space-y-3 text-[#687279] leading-relaxed">
            <ul className="list-disc pl-6 space-y-2">
              <li>台灣本島全區皆可配送</li>
              <li>
                離島地區（金門、馬祖、澎湖等）僅支援宅配，配送時間約 3–5 個工作日
              </li>
              <li>海外運送採運費到付</li>
            </ul>
          </div>
        </section>

        {/* 運費說明 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            運費說明
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#fffeee]">
                  <th className="text-left px-4 py-3 font-medium">配送方式</th>
                  <th className="text-left px-4 py-3 font-medium">運費</th>
                  <th className="text-left px-4 py-3 font-medium">免運門檻</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3">宅配到府</td>
                  <td className="px-4 py-3">NT$150</td>
                  <td className="px-4 py-3">滿 NT$999</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">7-11 超商取貨</td>
                  <td className="px-4 py-3">NT$65</td>
                  <td className="px-4 py-3">滿 NT$499</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">全家超商取貨</td>
                  <td className="px-4 py-3">NT$65</td>
                  <td className="px-4 py-3">滿 NT$499</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 注意事項 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            其他注意事項
          </h2>
          <div className="space-y-3 text-[#687279] leading-relaxed">
            <ul className="list-disc pl-6 space-y-2">
              <li>
                訂單出貨後，系統將自動寄送出貨通知及物流追蹤編號至您的電子信箱。
              </li>
              <li>
                如遇天災、連續假期或物流量大增等情況，配送時間可能延長，敬請見諒。
              </li>
              <li>
                請確保收件資訊正確無誤。因收件資訊錯誤導致配送失敗，衍生之額外運費由消費者負擔。
              </li>
              <li>
                超商取貨包裹逾期未取達兩次者，本公司保留暫停該配送方式使用權之權利。
              </li>
            </ul>
          </div>
        </section>

        <div className="border-t pt-6 text-sm text-zinc-500">
          <p>
            如有配送相關問題，歡迎聯繫客服：
            <a
              href="mailto:love@realreal.cc"
              className="underline hover:text-[#10305a]"
            >
              love@realreal.cc
            </a>
            {" "}或致電 02-66093066
          </p>
        </div>
      </div>
    </div>
  )
}
