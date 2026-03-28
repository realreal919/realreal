import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "隱私權政策 | 誠真生活 RealReal",
  description: "誠真生活 RealReal 隱私權政策，說明我們如何蒐集、使用及保護您的個人資料。",
}

const privacyHtml = `
<h5 style="text-align:center;"><strong>適用範圍</strong> Scope of Policy</h5>

<p>本隱私權保護政策適用於誠真生活網站、官網購物平台及官方 LINE、客服信箱所蒐集的個人資料。<br/>
This Privacy Policy applies to personal data collected through the Cheng Zhen Living website, online store, official LINE, and customer service email.</p>

<h5 style="text-align:center;">資料蒐集與使用 Data Collection &amp; Use</h5>

<p>為完成訂單、提供客服與會員服務，誠真生活將蒐集必要的個人資料（如姓名、聯絡方式、收件資訊）。<br/>
To process orders and provide customer and membership services, RealReal Living collects necessary personal information (such as name, contact details, and shipping information).</p>

<p>個人資料僅用於<strong>訂單處理、會員管理、服務通知與品牌相關溝通</strong>。<br/>
Personal data is used solely for order processing, membership management, service notifications, and brand-related communications.</p>

<h5 style="text-align:center;">資料保護 Data Protection</h5>

<p>誠真生活將採取合理之安全措施，保護你的個人資料不被未經授權存取、使用或洩漏。<br/>
RealReal Living implements reasonable security measures to protect your personal data from unauthorized access, use, or disclosure.</p>

<h5 style="text-align:center;">資料分享 Data Sharing</h5>

<p>除法律規定或完成訂單所必要（如物流、金流服務）外，誠真生活<strong>不會向第三方揭露、出售或交換你的個人資料</strong>。<br/>
Except as required by law or necessary to fulfill orders (e.g., logistics and payment services), RealReal Living does not sell, trade, or disclose personal data to third parties.</p>

<h5 style="text-align:center;">使用者權利 Your Rights</h5>

<p>你可依法查詢、更正或請求停止使用你的個人資料。<br/>
You have the right to access, correct, or request cessation of the use of your personal data in accordance with applicable laws.</p>

<h5 style="text-align:center;">條款更新 Policy Updates</h5>

<p>本隱私權條款如有調整，將公布於官網，不另行個別通知。<br/>
Any updates to this Privacy Policy will be posted on the website without individual notice.</p>
`

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-10 text-center text-[#10305a]">
        隱私權條款
      </h1>

      <div
        className="prose prose-headings:text-[#10305a] prose-p:text-[#687279] prose-strong:text-[#10305a] prose-h5:text-xl prose-h5:font-semibold prose-h5:mt-10 prose-h5:mb-4 prose-p:leading-relaxed max-w-none"
        dangerouslySetInnerHTML={{ __html: privacyHtml }}
      />
    </div>
  )
}
