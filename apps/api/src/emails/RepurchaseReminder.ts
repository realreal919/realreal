/**
 * 回購提醒信。出貨後第 30 天。
 *
 * 文案是店主 2026-10-09 定稿的。語氣刻意不催 —— 最後那句「如果手邊還有存貨，
 * 也不用急著補貨」是整封信的重點，拿掉它這封就變成一般的促銷信。
 *
 * 券的四個欄位（金額、門檻、優惠碼、期限）必須跟資料庫裡那張券完全一致：
 * 客人會照著信上的條件湊單。
 */
export function renderRepurchaseReminder(data: {
  customerName: string
  couponAmount: number
  couponMinOrder: number
  couponCode: string
  validUntil: string
}): string {
  const hi = data.customerName ? `${data.customerName} 您好，` : "您好，"
  return `
  <div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;line-height:1.9;color:#10305a;max-width:560px;margin:0 auto;padding:24px">
    <p>${hi}</p>
    <p>最近蛋白飲還夠喝嗎？</p>
    <p>無論是忙碌的早晨、運動後，或想作為日常飲食補充蛋白質，
       希望誠真生活都能成為您方便又安心的選擇。</p>
    <p>如果您最近剛好需要補貨，我們準備了一份回購小禮，謝謝您曾經選擇誠真生活。</p>

    <div style="background:#f6f8fa;border-radius:10px;padding:18px 20px;margin:24px 0">
      <p style="margin:0 0 12px"><strong>🎁 您的專屬回購折價券</strong></p>
      <table style="font-size:15px;line-height:2;border-collapse:collapse">
        <tr><td style="padding-right:16px;color:#687279">折抵金額</td><td><strong>NT$${data.couponAmount}</strong></td></tr>
        <tr><td style="padding-right:16px;color:#687279">使用門檻</td><td>消費滿 NT$${data.couponMinOrder.toLocaleString()}</td></tr>
        <tr><td style="padding-right:16px;color:#687279">優惠碼</td><td><strong style="letter-spacing:.15em">${data.couponCode}</strong></td></tr>
        <tr><td style="padding-right:16px;color:#687279">使用期限</td><td>${data.validUntil}</td></tr>
      </table>
    </div>

    <p style="margin:28px 0">
      <a href="https://realreal.cc/shop"
         style="display:inline-block;background:#10305a;color:#fff;text-decoration:none;
                padding:12px 28px;border-radius:999px;font-weight:600">
        去逛逛
      </a>
    </p>

    <p>如果手邊還有存貨，也不用急著補貨。按照自己的步調，找到適合的飲食方式就好。</p>
    <p>謝謝您讓誠真生活走進日常。</p>
    <p style="margin-top:24px">讓身心輕盈，讓生活誠真。</p>
    <p>誠真生活</p>

    <p style="color:#687279;font-size:13px;margin-top:28px">
      不想再收到這類提醒的話，到會員中心把行銷訊息關掉，我們就不會再寄。
    </p>
  </div>`
}
