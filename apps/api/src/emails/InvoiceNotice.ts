/**
 * 電子發票補寄通知。文案由店主核定（2026-10-20）。
 *
 * 背景：開票時沒有把買受人 email 帶給光貿，所以發票通知信從上線到 10/20
 * 一張都沒寄出去（見 lib/issue-invoice.ts 的說明）。沒有載具、也沒有捐贈的
 * 客人等於完全拿不到自己的發票號碼 —— 這封信就是補給他們的。
 *
 * 這是服務信不是行銷信，所以不看 marketing_opt_out：退訂行銷訊息的客人，
 * 自己的發票照樣有權知道。
 *
 * 一位客人可能有好幾張發票（最多 3 張），一次列完而不是寄好幾封。
 *
 * 刻意不提中獎、不附折價券（店主指定）。也不放 PDF 連結 —— 光貿的
 * /invoice/pdf/ 目前回的是錯誤頁，放了等於給客人一個壞掉的連結。
 */
export function renderInvoiceNotice(data: {
  customerName: string
  invoices: Array<{
    invoiceNumber: string
    /** 開立日期，格式 YYYY/MM/DD */
    issuedDate: string
    amount: number
    orderNumber: string
  }>
}): string {
  const hi = data.customerName ? `${data.customerName} 您好，` : "您好，"

  const rows = data.invoices
    .map(
      (inv) => `
      <div style="border:1px solid #e3e8ee;border-radius:8px;padding:14px 16px;margin:12px 0">
        <p style="margin:0 0 6px;font-size:16px;font-weight:700">
          發票號碼 <span style="font-family:monospace">${inv.invoiceNumber}</span>
        </p>
        <p style="margin:0;font-size:14px;color:#687279">
          開立日期 ${inv.issuedDate}　金額 NT$${inv.amount.toLocaleString("en-US")}　訂單編號 ${inv.orderNumber}
        </p>
      </div>`,
    )
    .join("")

  const plural = data.invoices.length > 1 ? "您的發票資訊如下：" : "您的發票資訊如下："

  return `
  <div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;line-height:1.9;color:#10305a;max-width:560px;margin:0 auto;padding:24px">
    <p>${hi}</p>

    <p>謝謝您在誠真生活的訂購。</p>

    <p>我們在例行檢查時發現，我們的系統在開立電子發票時漏填了您的電子信箱，
       導致發票開立通知信沒有寄到您手上。您的發票本身都已正常開立並上傳至
       財政部電子發票整合服務平台，權益不受影響，但沒有通知到您是我們的疏忽，向您致歉。</p>

    <p>${plural}</p>

    ${rows}

    <p>您可以憑發票號碼至財政部電子發票整合服務平台
       （<a href="https://www.einvoice.nat.gov.tw" style="color:#10305a">invoice.nat.gov.tw</a>）查詢發票內容。
       若您是會員，登入後也可以在「我的帳戶 → 訂單詳情」查看。</p>

    <p>造成不便非常抱歉。問題已經修正，往後的發票都會正常寄出通知。</p>

    <p>如果您需要發票證明聯或任何協助，直接回覆這封信就可以。</p>

    <p style="margin-top:24px">誠真生活 敬上</p>
  </div>`
}

export const INVOICE_NOTICE_SUBJECT = "補寄您的電子發票號碼｜誠真生活"
