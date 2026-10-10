/**
 * 會員制度更新通知的更正信。
 *
 * 2026-10-09 寄出的 151 封信裡，推薦回饋金額因為設定讀取的錯誤印成 0 元。
 * 制度本身運作正常，只有信上的數字錯了。
 *
 * 寫法上刻意做三件事：開門見山講錯在哪（不要讓人讀到第三段才知道為什麼收到
 * 這封）、明確說不用重新操作（收到更正信最怕的是「我是不是要重做什麼」）、
 * 提一句感謝券不受影響（避免有人以為整封信都作廢）。
 */
export function renderMembershipUpdateCorrection(data: {
  customerName: string
  /** 原信寄出的日期，例如 10/9 */
  originalSentOn: string
  referralMinOrder: number
  referralReward: number
  referralCode?: string | null
}): string {
  const hi = data.customerName ? `${data.customerName} 您好，` : "您好，"
  const codeLine = data.referralCode
    ? `<p style="margin:8px 0 0">您的專屬推薦碼：<strong style="letter-spacing:.15em">${data.referralCode}</strong></p>`
    : ""

  return `
  <div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;line-height:1.9;color:#10305a;max-width:560px;margin:0 auto;padding:24px">
    <p>${hi}</p>
    <p>${data.originalSentOn} 寄給您的會員制度更新信中，推薦朋友的回饋金額誤植為 0 元，
       是我們的疏失，向您說明一下。</p>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>正確的內容是：</strong></p>
      <p style="margin:8px 0 0">推薦朋友首次消費滿 ${data.referralMinOrder.toLocaleString()} 元，
         您與朋友各獲得 <strong>${data.referralReward} 元</strong>公益存款，
         可選擇下次購物折抵，或留存累積，讓善意持續發生。</p>
      ${codeLine}
    </div>

    <p>制度本身一直是正常運作的，只有那封信上的數字寫錯。如果您已經把推薦碼分享出去，
       回饋都會照常計算，不需要重新操作。</p>
    <p>您的老朋友感謝券也不受影響，條件與期限都和信上一致。</p>

    <p style="margin:28px 0">
      <a href="https://realreal.cc/my-account"
         style="display:inline-block;background:#10305a;color:#fff;text-decoration:none;
                padding:12px 28px;border-radius:999px;font-weight:600">
        到會員中心查看
      </a>
    </p>

    <p>造成困擾，不好意思。</p>
    <p style="margin-top:24px">讓身心輕盈，讓生活誠真。</p>
    <p>誠真生活</p>

    <p style="color:#687279;font-size:13px;margin-top:28px">
      不想再收到這類信件的話，到會員中心把行銷訊息關掉，我們就不會再寄。
    </p>
  </div>`
}
