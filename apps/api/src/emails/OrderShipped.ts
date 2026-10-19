/**
 * 出貨通知信。
 *
 * 超商取貨付款的客人收到這封信時，錢還沒付 —— 他們要帶著金額走到門市櫃檯。
 * 原本這封信對所有訂單一視同仁地寫「已出貨，請留意到貨通知」，於是 COD 客人
 * 從頭到尾沒有一封信告訴他們「取貨當下要付多少」：下單信寫的是「訂單已成立」，
 * 出貨信只寫「已出貨」。金額只出現在下單當天那封信裡，等到七天後真的去取貨，
 * 那封信早就被埋掉了。
 *
 * 所以 COD 訂單的出貨信必須自己帶著金額與門市。非 COD 訂單維持原樣（錢已經付
 * 過了，再提金額只會讓人以為要再付一次）。
 */
export function renderOrderShipped(data: {
  orderNumber: string
  customerName: string
  /** 超商取貨付款：取貨時要在門市支付的金額。已付款的訂單不帶這個值。 */
  codAmount?: number | null
  /** 取件門市或宅配說明；沒有就不顯示這一列。 */
  pickupInfo?: string | null
  /** 電子發票號碼；還沒開立就不帶，整段不顯示。 */
  invoiceNumber?: string | null
  /** 發票開立日期（YYYY-MM-DD，台灣時間）。 */
  invoiceDate?: string | null
}): string {
  const codAmount = Number(data.codAmount ?? 0)
  const isCod = codAmount > 0

  // 電子發票。客人問最多的就是「發票呢」—— 號碼寫在信裡，他要報帳或上財政部
  // 平台查都有依據。這裡不放 PDF 連結：Amego 的 /invoice/pdf/ 目前回的是
  // 錯誤頁（見交付說明），放了只會讓客人以為我們給了壞連結。
  const invoiceBlock = data.invoiceNumber
    ? `<div style="border:1px solid #e3e8ee;border-radius:8px;padding:14px 16px;margin:20px 0">
      <p style="margin:0 0 8px;font-weight:700;color:#10305a">電子發票已開立</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 0;color:#687279;width:90px">發票號碼</td><td style="font-family:monospace;font-weight:600">${data.invoiceNumber}</td></tr>
        ${data.invoiceDate ? `<tr><td style="padding:4px 0;color:#687279">開立日期</td><td>${data.invoiceDate}</td></tr>` : ""}
      </table>
      <p style="margin:10px 0 0;font-size:13px;color:#687279">
        發票已上傳財政部電子發票整合服務平台。登入會員後也可以在
        <a href="https://realreal.cc/my-account" style="color:#10305a">我的帳戶</a> 查看。
      </p>
    </div>`
    : ""

  const pickupRow = data.pickupInfo
    ? `<tr><td style="padding:6px 0;color:#687279;width:90px;vertical-align:top">取件資訊</td><td style="vertical-align:top">${data.pickupInfo}</td></tr>`
    : ""

  const codBlock = isCod
    ? `<div style="border:1px solid #f0c36d;background:#fff8e6;border-radius:8px;padding:14px 16px;margin:20px 0">
      <p style="margin:0 0 8px;font-weight:700;color:#8a5a00">這是「超商取貨付款」訂單</p>
      <p style="margin:0;color:#5c4400;line-height:1.9">
        取貨時請在門市櫃檯支付
        <strong style="font-size:19px;color:#b45309">NT$ ${codAmount.toLocaleString("en-US")}</strong><br>
        包裹到店後會以簡訊通知，<strong>請於通知後 7 天內取貨</strong>，逾期未取包裹會被退回。
      </p>
    </div>`
    : ""

  const closing = isCod
    ? `<p>包裹到達門市後，超商會發簡訊通知您，屆時請攜帶手機至門市取貨並完成付款。</p>`
    : `<p>請留意手機通知到貨訊息。</p>`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
    <h1 style="color:#10305a;border-bottom:2px solid #10305a;padding-bottom:8px">誠真生活 RealReal</h1>
    <p>親愛的 ${data.customerName}，</p>
    <p>訂單 <strong>#${data.orderNumber}</strong> 已出貨，感謝您的耐心等待。</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0">
      <tr><td style="padding:6px 0;color:#687279;width:90px">訂單編號</td><td style="font-family:monospace;font-weight:600">${data.orderNumber}</td></tr>
      ${pickupRow}
    </table>
    ${codBlock}
    ${invoiceBlock}
    ${closing}
    <p>如有任何問題，歡迎與我們聯繫。</p>
    <p>我們會用誠真，回覆您。</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #eee">
    <p style="font-size:13px;color:#555;line-height:2">
      誠真生活 | <a href="https://realreal.cc" style="color:#10305a">realreal.cc</a><br>
      Email: <a href="mailto:love@realreal.cc" style="color:#10305a">love@realreal.cc</a><br>
      Line 真人客服: @900kevgi
    </p>
  </body></html>`
}
