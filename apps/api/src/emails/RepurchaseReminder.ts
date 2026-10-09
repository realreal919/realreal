/**
 * 回購提醒信。
 *
 * 語氣是「想起你差不多該喝完了」而不是促銷 —— 這封信是在客人還沒想到要買的
 * 時候出現的，講得像廣告只會被略過。券的期限講清楚，但不加催促。
 */
export function renderRepurchaseReminder(data: {
  customerName: string
  couponAmount: number
  validDays: number
  validUntil: string
}): string {
  const hi = data.customerName ? `${data.customerName} 您好，` : "您好，"
  return `
  <div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;line-height:1.9;color:#10305a;max-width:560px;margin:0 auto;padding:24px">
    <p>${hi}</p>
    <p>算一算，上次的份量差不多該喝完了。</p>
    <p>附上一張 <strong>${data.couponAmount} 元</strong> 的夾鏈袋折價券，
       ${data.validDays} 天內（${data.validUntil} 前）結帳時會自動帶入，不需要輸入代碼。</p>
    <p style="margin:28px 0">
      <a href="https://realreal.cc/shop"
         style="display:inline-block;background:#10305a;color:#fff;text-decoration:none;
                padding:12px 28px;border-radius:999px;font-weight:600">
        去逛逛
      </a>
    </p>
    <p style="color:#687279;font-size:14px">
      如果這陣子還不需要，忽略這封信就好。不想再收到這類提醒的話，
      到會員中心把行銷訊息關掉，我們就不會再寄。
    </p>
    <p style="color:#687279;font-size:14px">誠真生活 RealReal</p>
  </div>`
}
