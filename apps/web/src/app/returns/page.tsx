import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "退換貨政策 | 誠真生活 RealReal",
  description: "誠真生活 RealReal 退換貨政策，依消費者保護法保障您的退貨權益。",
}

const steps = [
  {
    step: "1",
    title: "提出申請",
    description:
      "登入您的帳戶，前往「我的帳戶 > 訂單紀錄」，選擇需退換貨的訂單，點選「申請退換貨」並填寫原因。",
  },
  {
    step: "2",
    title: "客服審核",
    description:
      "客服人員將於 1 個工作日內審核您的申請，並以電子郵件或簡訊通知審核結果。",
  },
  {
    step: "3",
    title: "寄回商品",
    description:
      "審核通過後，請於 7 日內將商品以原包裝完整寄回。我們將提供退貨專用物流單，免付寄回運費。",
  },
  {
    step: "4",
    title: "退款處理",
    description:
      "收到退貨商品並確認商品狀態無誤後，將於 3–5 個工作日內完成退款至原付款方式。",
  },
]

export default function ReturnsPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2 text-center">退換貨政策</h1>
      <p className="text-zinc-500 text-center mb-10">
        依據消費者保護法，保障您的購物權益
      </p>

      <div className="space-y-10">
        {/* 七天鑑賞期 */}
        <section className="border rounded-lg p-6 bg-zinc-50">
          <h2 className="text-xl font-semibold mb-3">七天鑑賞期保障</h2>
          <p className="text-zinc-700 leading-relaxed">
            依據消費者保護法第 19 條規定，透過網路購物之消費者，享有收到商品後七日內無條件退貨之權利（鑑賞期非試用期）。您無須說明理由及負擔任何費用，即可申請退貨。
          </p>
        </section>

        {/* 退貨條件 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">
            退貨條件
          </h2>
          <div className="space-y-3 text-zinc-700 leading-relaxed">
            <p>符合以下條件之商品，方可辦理退貨：</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>收到商品後七日內提出退貨申請</li>
              <li>商品未經拆封、使用，且保持原始包裝完整</li>
              <li>商品之外盒、配件、贈品、保證書等附件齊全</li>
              <li>商品無人為損壞或非正常使用之痕跡</li>
            </ul>
          </div>
        </section>

        {/* 不適用退貨 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">
            不適用退貨之情形
          </h2>
          <div className="space-y-3 text-zinc-700 leading-relaxed">
            <p>以下情形依法不適用七天鑑賞期退貨規定：</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>食品類商品已拆封（商品本身瑕疵者除外）</li>
              <li>
                經消費者要求所為之客製化商品
              </li>
              <li>已過保存期限之商品</li>
              <li>因消費者個人因素導致商品損壞或污損</li>
            </ul>
            <p className="text-sm text-zinc-500">
              如商品本身有瑕疵或與訂購內容不符，不受上述限制，請儘速聯繫客服為您處理。
            </p>
          </div>
        </section>

        {/* 退貨流程 */}
        <section>
          <h2 className="text-xl font-semibold mb-6 border-b pb-2">
            退貨流程
          </h2>
          <div className="space-y-4">
            {steps.map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-sm font-medium">
                  {item.step}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 換貨說明 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">
            換貨說明
          </h2>
          <div className="space-y-3 text-zinc-700 leading-relaxed">
            <ul className="list-disc pl-6 space-y-2">
              <li>
                如收到之商品有瑕疵或與訂購內容不符，請於收到商品後 7 天內申請換貨。
              </li>
              <li>
                換貨商品將於收到退回商品並確認後 1–3 個工作日內重新出貨。
              </li>
              <li>
                因商品瑕疵或錯誤出貨所產生之換貨運費，由本公司負擔。
              </li>
              <li>
                如欲更換之商品已無庫存，將協助辦理退款或更換其他等值商品。
              </li>
            </ul>
          </div>
        </section>

        {/* 退款時間 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">
            退款時間
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50">
                  <th className="text-left px-4 py-3 font-medium">付款方式</th>
                  <th className="text-left px-4 py-3 font-medium">退款時間</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-3">信用卡</td>
                  <td className="px-4 py-3">
                    退回信用卡帳戶，約 7–14 個工作日
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">LINE Pay</td>
                  <td className="px-4 py-3">
                    退回 LINE Pay 帳戶，約 3–5 個工作日
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">貨到付款</td>
                  <td className="px-4 py-3">
                    匯款至指定帳戶，約 5–7 個工作日
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div className="border-t pt-6 text-sm text-zinc-500">
          <p>
            如有退換貨相關問題，歡迎聯繫客服：
            <a
              href="mailto:hello@realreal.cc"
              className="underline hover:text-zinc-900"
            >
              hello@realreal.cc
            </a>
            {" "}或致電 (02) 2345-6789（週一至週五 09:00–18:00）
          </p>
        </div>
      </div>
    </div>
  )
}
