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
  /** 隨信發的感謝券，一次多張。面額大的排前面。 */
  coupons: Array<{ amount: number; minOrder: number; code: string }>
  validUntil: string
  rebatePercent: number
  referralMinOrder: number
  referralReward: number
  referralCode?: string | null
}): string {
  const hi = data.customerName ? `${data.customerName} 您好，` : "您好，"
  // 一張券一個區塊。兩張並列在同一個表格裡的話，哪個門檻配哪個碼很容易看錯。
  const couponRows = data.coupons
    .map(
      (c, i) => `
      <div style="${i > 0 ? "margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2)" : ""}">
        <p style="margin:0;font-size:17px"><strong>滿 NT$${c.minOrder.toLocaleString()} 折 NT$${c.amount}</strong></p>
        <p style="margin:4px 0 0;font-size:14px;opacity:.85">
          優惠碼：<strong style="letter-spacing:.15em">${c.code}</strong>
        </p>
      </div>`,
    )
    .join("")

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
      <p style="margin:0"><strong>🥄 第一次購買夾鏈袋，送 1 支不鏽鋼量匙</strong></p>
      <p style="margin:8px 0 0">夾鏈袋裝本身沒有附量匙。如果您還沒拿過，下次購買夾鏈袋時我們會主動一起寄出；
         如果您需要多根，可以選擇再加購。</p>
    </div>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>🤍 推薦朋友，雙方都有回饋</strong></p>
      <p style="margin:8px 0 0">推薦朋友首次消費滿 ${data.referralMinOrder.toLocaleString()} 元，
         您與朋友各獲得 ${data.referralReward} 元公益存款，
         可選擇下次購物折抵，或留存累積，讓善意持續發生。</p>
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
      <p style="margin:0 0 12px"><strong>🎁 老朋友感謝券${data.coupons.length > 1 ? ` ${data.coupons.length} 張` : ""}</strong></p>
      ${couponRows}
      <p style="margin:14px 0 0;font-size:13px;opacity:.75">
        使用期限：${data.validUntil}｜優惠可併用
      </p>
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
