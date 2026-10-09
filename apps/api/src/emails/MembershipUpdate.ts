/**
 * 會員制度更新通知信（一次性廣播）。
 *
 * 隨信發一張「老朋友感謝券」（滿 1500 折 100）。券的四個欄位必須跟資料庫裡
 * 那張券完全一致 —— 客人會照著信上的條件湊單。
 *
 * 文案草稿由 Claude 擬、店主定稿。語氣對齊另外兩封信：不推銷，講清楚改了什麼。
 */
export function renderMembershipUpdate(data: {
  customerName: string
  couponAmount: number
  couponMinOrder: number
  couponCode: string
  validUntil: string
  rebatePercent: number
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
    <p>誠真生活的會員制度做了一些調整，想第一時間讓您知道。</p>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>🌱 每筆消費 ${data.rebatePercent}% 公益存款，不分等級</strong></p>
      <p style="margin:8px 0 0">以前不同等級回饋比例不同（2%–${data.rebatePercent}%），現在統一提升為 ${data.rebatePercent}%。
         這筆存款是您的，您可以在下次購物時折抵使用，也可以選擇留著和其他會員一起累積，
         讓這份心意流向需要的地方。</p>
    </div>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>🥄 第一次購買夾鏈袋，送不鏽鋼量匙</strong></p>
      <p style="margin:8px 0 0">夾鏈袋裝本身沒有附量匙。如果您還沒拿過，下次購買夾鏈袋時我們會主動一起寄出；
         如果您需要多根，也可以再加購。</p>
    </div>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>🤍 推薦朋友，雙方都有回饋</strong></p>
      <p style="margin:8px 0 0">新朋友第一次消費折扣前滿 ${data.referralMinOrder.toLocaleString()} 元，
         您與朋友都能各獲得 ${data.referralReward} 元公益存款，可於下次消費時折抵使用。</p>
      ${codeLine}
      <p style="margin:12px 0 0">
        <a href="https://realreal.cc/my-account" style="color:#10305a;font-weight:600">
          到會員中心看您的推薦碼 →
        </a>
      </p>
    </div>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>⭐ 不只看買得多，也看走得近</strong></p>
      <p style="margin:8px 0 0">願意分享使用心得、提供建議、參與活動的朋友，
         我們都記在心上。這些互動會成為會員權益升級的參考，
         獲邀升級的會員將有機會參與線上或線下活動、新品試喝體驗，以及更多專屬禮遇。</p>
    </div>

    <p style="margin-top:28px">另外，想謝謝您這一路的支持，準備了一份小禮：</p>

    <div style="background:#10305a;color:#fff;border-radius:10px;padding:18px 20px;margin:16px 0">
      <p style="margin:0 0 12px"><strong>🎁 老朋友感謝券</strong></p>
      <table style="font-size:15px;line-height:2;border-collapse:collapse;color:#fff">
        <tr><td style="padding-right:16px;opacity:.75">折抵金額</td><td><strong>NT$${data.couponAmount}</strong></td></tr>
        <tr><td style="padding-right:16px;opacity:.75">使用門檻</td><td>消費滿 NT$${data.couponMinOrder.toLocaleString()}</td></tr>
        <tr><td style="padding-right:16px;opacity:.75">優惠碼</td><td><strong style="letter-spacing:.15em">${data.couponCode}</strong></td></tr>
        <tr><td style="padding-right:16px;opacity:.75">使用期限</td><td>${data.validUntil}</td></tr>
      </table>
    </div>

    <p style="margin:28px 0">
      <a href="https://realreal.cc/shop"
         style="display:inline-block;background:#10305a;color:#fff;text-decoration:none;
                padding:12px 28px;border-radius:999px;font-weight:600">
        去逛逛
      </a>
    </p>

    <p>謝謝您讓誠真生活走進日常。</p>
    <p style="margin-top:24px">讓身心輕盈，讓生活誠真。</p>
    <p>誠真生活</p>

    <p style="color:#687279;font-size:13px;margin-top:28px">
      不想再收到這類信件的話，到會員中心把行銷訊息關掉，我們就不會再寄。
    </p>
  </div>`
}
