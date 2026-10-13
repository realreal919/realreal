/**
 * 出貨延後通知。文案由店主提供（2026-10-13）。
 *
 * 這是「關於你自己那張訂單」的服務信，不是行銷信 —— 所以不看
 * user_profiles.marketing_opt_out。退訂行銷訊息的客人，訂單晚出貨一樣要知道。
 *
 * 出貨日期是參數而不是寫死的：延後不會只發生一次，而每次的日期都不一樣。
 * 星期幾也由呼叫端一起帶進來（例「10/15（四）」）—— 在這裡用程式算星期幾，
 * 等於把時區問題帶進一封會寄給客人的信裡，寫錯一個字就是客服電話。
 */
export function renderOrderDelayNotice(data: {
  customerName: string
  orderNumber: string
  /** 出貨日，照著印，例：「10/15（四）」 */
  shipDate: string
}): string {
  const hi = data.customerName ? `${data.customerName} 您好，` : "您好，"

  return `
  <div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;line-height:1.9;color:#10305a;max-width:560px;margin:0 auto;padding:24px">
    <p>${hi}</p>
    <p>您在誠真生活的訂單 <strong>${data.orderNumber}</strong> 我們已經收到了。</p>

    <p>這次要先跟您說一聲抱歉，因為訂單中有品項目前缺貨，需要稍長一些的備貨時間，
       我們預計於 <strong>${data.shipDate}</strong> 出貨，出貨後會寄送出貨通知信到您的信箱。</p>

    <p>讓您多等了幾天，不好意思。如果有需要調整訂單內容，歡迎在 LINE 上告訴我們
       （<a href="https://line.me/R/ti/p/@900kevgi" style="color:#10305a">@900kevgi</a>），
       我們會盡快為您處理。</p>

    <p>謝謝您的耐心。</p>

    <p style="margin-top:24px">讓身心輕盈，讓生活誠真。</p>
    <p>誠真生活 RealReal</p>
  </div>`
}

export const ORDER_DELAY_SUBJECT = "您的訂單出貨時間說明｜誠真生活"
