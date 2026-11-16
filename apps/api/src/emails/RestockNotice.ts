/**
 * 到貨通知信。客人在缺貨的商品頁留下信箱，店主在後台按「通知他們」才寄。
 *
 * 這封信有一個特性跟其他信不同：**收信的人會立刻跑去買**。所以信裡只講一件事
 * （東西到了、連結在這），不塞其他商品、不塞活動 —— 多一個連結就多一個讓人
 * 分心、最後什麼都沒買的機會。
 *
 * 也不寫「數量有限，要搶要快」。補貨數量本來就常常不夠所有登記的人，催促只會
 * 讓沒搶到的那幾位更難受；誠實地講「到貨了」就夠了。
 */
export function renderRestockNotice(data: {
  productName: string
  productUrl: string
  /** 有留名字就稱呼，訪客留 email 時就是 null。 */
  customerName?: string | null
}): string {
  const hi = data.customerName ? `${data.customerName} 您好，` : "您好，"

  return `
  <div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;line-height:1.9;color:#10305a;max-width:560px;margin:0 auto;padding:24px">
    <p>${hi}</p>
    <p>您之前在缺貨時留下了信箱，想告訴您一聲 ——</p>

    <p style="font-size:18px;font-weight:700;margin:20px 0">
      ${data.productName} 到貨了。
    </p>

    <p style="margin:24px 0">
      <a href="${data.productUrl}"
         style="display:inline-block;background:#10305a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600">
        前往選購
      </a>
    </p>

    <p style="font-size:14px;color:#687279">
      這封信只會寄這一次。如果之後還想收到其他品項的到貨通知，到那個商品頁再留一次信箱就可以了。
    </p>

    <p style="margin-top:24px">讓身心輕盈，讓生活誠真。</p>
    <p>誠真生活 RealReal<br>
      <a href="mailto:love@realreal.cc" style="color:#10305a">love@realreal.cc</a>
    </p>
  </div>`
}

export function restockSubject(productName: string): string {
  return `${productName} 到貨了｜誠真生活`
}
