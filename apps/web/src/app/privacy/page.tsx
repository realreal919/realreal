import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "隱私權政策 | 誠真生活 RealReal",
  description: "誠真生活 RealReal 隱私權政策，說明我們如何蒐集、使用及保護您的個人資料。",
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2 text-center text-[#10305a]">隱私權政策</h1>
      <p className="text-[#687279] text-center mb-10">
        最後更新日期：2025 年 1 月 1 日
      </p>

      <div className="space-y-10">
        <p className="text-[#687279] leading-relaxed">
          誠真生活 RealReal（以下簡稱「本公司」）非常重視您的隱私權。本隱私權政策說明我們如何蒐集、處理、利用及保護您的個人資料，請您詳閱以下內容。
        </p>

        {/* 資料蒐集 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            一、資料蒐集
          </h2>
          <div className="space-y-3 text-[#687279] leading-relaxed">
            <p>當您使用本公司網站或服務時，我們可能蒐集以下個人資料：</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>基本資料：姓名、電子信箱、聯絡電話、通訊地址</li>
              <li>帳號資料：帳號名稱、密碼（加密儲存）</li>
              <li>交易資料：訂單紀錄、付款資訊、配送地址</li>
              <li>瀏覽資料：IP 位址、瀏覽器類型、裝置資訊、瀏覽頁面及時間</li>
              <li>客服互動紀錄：您與客服之間的通訊內容</li>
            </ul>
          </div>
        </section>

        {/* 使用目的 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            二、使用目的
          </h2>
          <div className="space-y-3 text-[#687279] leading-relaxed">
            <p>我們蒐集您的個人資料僅用於以下目的：</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>處理您的訂單、配送商品及提供售後服務</li>
              <li>管理您的會員帳號及提供會員權益</li>
              <li>寄送訂單通知、出貨通知及相關服務訊息</li>
              <li>經您同意後，寄送行銷活動、優惠資訊及電子報</li>
              <li>改善網站功能及使用者體驗</li>
              <li>進行統計分析及市場調查（去識別化處理）</li>
              <li>遵守法律規定及配合主管機關要求</li>
            </ul>
          </div>
        </section>

        {/* Cookie 政策 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            三、Cookie 政策
          </h2>
          <div className="space-y-3 text-[#687279] leading-relaxed">
            <p>
              本網站使用 Cookie 及類似技術來提升您的瀏覽體驗。Cookie
              是一種儲存在您裝置上的小型文字檔案，用於記錄您的偏好設定與瀏覽行為。
            </p>
            <p>我們使用的 Cookie 類型包括：</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium">必要性 Cookie：</span>
                維持網站正常運作所必需，例如購物車功能、登入狀態
              </li>
              <li>
                <span className="font-medium">功能性 Cookie：</span>
                記住您的偏好設定，提供個人化體驗
              </li>
              <li>
                <span className="font-medium">分析性 Cookie：</span>
                協助我們了解網站使用狀況，以持續優化服務
              </li>
            </ul>
            <p>
              您可以透過瀏覽器設定管理或刪除
              Cookie，但部分功能可能因此無法正常使用。
            </p>
          </div>
        </section>

        {/* 第三方分享 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            四、第三方分享
          </h2>
          <div className="space-y-3 text-[#687279] leading-relaxed">
            <p>
              本公司不會任意將您的個人資料出售或提供給第三方。僅在以下情況下，我們可能與第三方共享您的資料：
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium">物流合作夥伴：</span>
                為配送商品所需，提供收件人姓名、地址及聯絡電話予物流業者（如黑貓宅急便、超商物流）
              </li>
              <li>
                <span className="font-medium">金流服務商：</span>
                為處理付款所需，透過第三方金流平台進行交易驗證
              </li>
              <li>
                <span className="font-medium">法律要求：</span>
                依法院命令、政府機關依法要求或法律規定必須揭露時
              </li>
            </ul>
            <p>
              上述第三方合作夥伴均受保密條款約束，僅能在授權範圍內使用您的資料。
            </p>
          </div>
        </section>

        {/* 資料保護 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            五、資料保護
          </h2>
          <div className="space-y-3 text-[#687279] leading-relaxed">
            <p>本公司採取以下措施保護您的個人資料安全：</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>所有資料傳輸均使用 SSL/TLS 加密技術</li>
              <li>密碼以不可逆加密方式儲存</li>
              <li>定期進行資安檢測與系統更新</li>
              <li>嚴格限制內部人員資料存取權限</li>
              <li>與第三方合作夥伴簽訂資料保護協議</li>
            </ul>
            <p>
              您有權隨時查詢、更正或刪除您的個人資料。如需行使上述權利，請透過下方聯絡方式與我們聯繫。
            </p>
          </div>
        </section>

        {/* 聯絡方式 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-[#10305a]">
            六、聯絡方式
          </h2>
          <div className="space-y-3 text-[#687279] leading-relaxed">
            <p>
              如您對本隱私權政策有任何疑問，或需要行使個人資料相關權利，歡迎透過以下方式聯繫我們：
            </p>
            <div className="border-none rounded-lg p-5 bg-[#fffeee] space-y-2 text-sm">
              <p>
                <span className="font-medium">公司名稱：</span>誠真生活
                RealReal
              </p>
              <p>
                <span className="font-medium">電子信箱：</span>
                <a
                  href="mailto:hello@realreal.cc"
                  className="underline hover:text-[#10305a]"
                >
                  hello@realreal.cc
                </a>
              </p>
              <p>
                <span className="font-medium">客服電話：</span>(02)
                2345-6789
              </p>
              <p>
                <span className="font-medium">服務時間：</span>週一至週五
                09:00–18:00
              </p>
            </div>
            <p className="text-sm text-zinc-500">
              本公司保留隨時修改本隱私權政策之權利。修改後的政策將公告於本頁面，建議您定期查閱。
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
