import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "購物須知 | 誠真生活 RealReal",
  description: "誠真生活 RealReal 購物須知，包含商品說明、付款發票、包裝、運送、退換貨及聯絡資訊。",
}

const contentHtml = `
<h5>商品說明 Product</h5>
<ul>
  <li>無動物性製品，亦不經動物實驗。<br />100% animal-free and cruelty-free.<br /><br /></li>
  <li>以天然成分、最少量添加物為本。<br />Made with natural ingredients and minimal additives.</li>
  <li>凍乾水果因批次不同，外觀與口感略有差異，屬正常現象。<br />Freeze-dried fruits may vary slightly in appearance and texture.</li>
</ul>

<h5>付款與發票 Payment &amp; Invoice</h5>
<ul>
  <li><p>支援信用卡付款。<br />Credit card payment is available.<br /><br /></p></li>
  <li><p>訂單成立後即開立發票。<br />An invoice will be issued once the order is confirmed.<br /><br /></p></li>
  <li><p>發票可以開立統一編號。<br />Invoices can be issued with business tax ID number.<br /><br /></p></li>
  <li><p>電子發票將寄送至您的電子信箱，請點選此連結確認<a href="https://invoice.amego.tw/info_detail?mid=11">完成發票歸戶</a>。<br />Electronic invoices will be sent to your email address.</p></li>
</ul>

<h5>包裝說明 Package</h5>
<ul>
  <li>以簡化包裝、減少一次性包材為原則。<br />Reduce single-use material by minimal packaging approach.<br /><br /></li>
  <li>出貨紙箱為原色<strong>AB楞厚紙箱</strong>，樸實堅固，提供商品最好的保護。<br />Products are shipped in sturdy, unprinted AB flute corrugated boxes for reliable protection.<br /><br /></li>
  <li>可能會<strong>使用乾淨之回收包材</strong>。<br />Clean &amp; recycled packaging materials will be used whenever possible.<br /><br /></li>
  <li>食品夾鏈袋可<strong>重複使用</strong>，兼顧保存與永續。<br />Reusable zip bags are used for food products to ensure freshness while supporting sustainability.</li>
</ul>

<h5>永續獎勵 Green Reward</h5>
<ul>
  <li>夾鏈袋與紙箱歡迎重複利用，拍照分享至社群媒體即可獲得<strong>永續獎勵金</strong>，讓包裝延續價值。<br />Please <strong>reuse our zip bags and shipping boxes</strong>.<br />Share a photo of how you reuse them on your social media and receive a <strong>Green reward</strong>.</li>
</ul>

<h5>運送方式 Delivery</h5>
<ul>
  <li>宅配通 / 7-11 / 全家超商取貨。<br />Domestic home delivery / 7-Eleven / FamilyMart pickup.</li>
  <li><p>海外運送採運費到付。<br />Shipping to overseas with shipping fee paid upon delivery.</p></li>
  <li>如貨物尺寸超過超商取貨限制，將通知您改採用宅配通。<br />If the package size exceeds the 7-11 pickup limits, you will be notified to switch to home delivery.</li>
  <li><p>宅配運費 NT$150，超商取貨運費 NT$65。<br />Shipping fee: NT$150 for home delivery, NT$65 for 7-Eleven pickup.</p></li>
  <li><p>消費滿 NT$499超商取或免運，消費滿 NT$999宅配免運。</p></li>
  <li><p>Free shipping by 7-11 or FamilyMart pickup for orders over NT$499, and by domestic home delivery for order over NT$999.</p></li>
</ul>

<h5>出貨說明 Shipping</h5>
<ul>
  <li>付款完成即成立訂單，2–5 個工作天出貨（不含例假日）。<br />Orders ship within 2–5 business days after payment.<br /><br /></li>
  <li>到貨時間依物流公司為準。<br />Delivery time depends on the carrier.<br /><br /></li>
  <li>預購商品以商品頁說明為準。<br />Pre-order items follow product page schedules.</li>
</ul>

<h5>退換貨 Returns</h5>
<ul>
  <li>7 日鑑賞期（非試用期）。<br />7-day inspection period.<br /><br /></li>
  <li>食品一經拆封，恕不退換。<br />Opened food items are non-returnable.<br /><br /></li>
  <li>破損或寄錯，請於 48 小時內聯繫客服。<br />Contact us within 48 hours for damaged or incorrect items.</li>
</ul>

<h5>免責聲明 Disclaimer</h5>
<ul>
  <li>產品為營養補充用途，非醫療產品。<br />For nutritional support only, not a medical product.<br /><br /></li>
  <li>特殊體質、孕期或治療中者，請先諮詢專業人士。<br />Consult a professional if pregnant or under medical care.</li>
</ul>

<h5>聯絡我們 Contact</h5>
<p><a href="https://line.me/R/ti/p/@900kevgi" target="_blank" rel="noopener">官方 LINE</a> | <a href="mailto:love@realreal.cc">客服信箱</a> | 02-66093066<br /><a href="https://line.me/R/ti/p/@900kevgi" target="_blank" rel="noopener">Official LINE</a> | <a href="mailto:love@realreal.cc">Customer Service Email</a> | Tel 02-66093066</p>
<p>我們會用誠真回應你。<br />We respond with sincerity.</p>
`

export default function ReturnsPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-8 text-center text-[#10305a]">
        購物須知
      </h1>
      <div
        className="prose prose-headings:text-[#10305a] prose-p:text-[#687279] prose-li:text-[#687279] prose-a:text-[#10305a] prose-a:underline hover:prose-a:opacity-80 prose-strong:text-[#10305a] max-w-none"
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />
    </div>
  )
}
