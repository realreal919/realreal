/**
 * 使用回饋信。出貨後第 14 天。
 *
 * 文案是店主 2026-10-09 定稿的，改動請先問過 —— 這封信的語氣（關心使用體驗、
 * 不推銷）是刻意的，加一句促銷就會把整封信變成廣告。
 */
const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdq-fhIXgL1spAGzkTCV256wDeKP0RWwk9O7wcHl8aqurLMfw/viewform"

export function renderFeedbackRequest(data: {
  customerName: string
  /** 推薦碼。配不到就只放「登入領取」的連結，不留一個空白的碼。 */
  referralCode?: string | null
  referralMinOrder?: number
  referralReward?: number
}): string {
  const hi = data.customerName ? `${data.customerName} 您好，` : "您好，"
  const minOrder = (data.referralMinOrder ?? 650).toLocaleString()
  const reward = data.referralReward ?? 50

  const codeLine = data.referralCode
    ? `<p style="margin:8px 0 0">您的專屬推薦碼：<strong style="letter-spacing:.15em">${data.referralCode}</strong></p>`
    : ""

  return `
  <div style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;line-height:1.9;color:#10305a;max-width:560px;margin:0 auto;padding:24px">
    <p>${hi}</p>
    <p>謝謝您選擇誠真生活。</p>
    <p>不知道這段時間喝得還習慣嗎？</p>
    <p>不論是喜歡某個口味、覺得沖泡方式還能更方便，或是有些地方不太符合期待，
       我們都想聽聽您的想法，讓產品可以做得更好。</p>

    <p style="margin-top:24px"><strong>如果您願意，想邀請您花 1 分鐘，與我們分享使用心得：</strong></p>
    <p style="margin:16px 0 28px">
      <a href="${FEEDBACK_FORM_URL}"
         style="display:inline-block;background:#10305a;color:#fff;text-decoration:none;
                padding:12px 28px;border-radius:999px;font-weight:600">
        分享使用回饋
      </a>
    </p>

    <p>另外，也想與您分享誠真生活的會員理念。</p>
    <p>我們不只在乎消費，也珍惜每一次真實的分享、回饋與參與。</p>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>🌱 您的 3% 公益存款</strong></p>
      <p style="margin:8px 0 0">每筆消費都會累積 3% 公益存款至您的會員帳戶。您可以選擇在下次購物時折抵使用，
         也可以與其他會員一起持續累積，讓這份心意流向需要的地方。</p>
    </div>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>🤍 推薦給朋友，彼此都能獲得回饋</strong></p>
      <p style="margin:8px 0 0">如果您覺得誠真生活的植物蛋白喝得順口，也歡迎分享給身邊的朋友。</p>
      <p style="margin:8px 0 0">推薦朋友首次消費滿 ${minOrder} 元（折扣前），您與朋友各獲得 ${reward} 元公益存款，
         可選擇下次購物折抵，或留存累積，讓善意持續發生。</p>
      ${codeLine}
      <p style="margin:12px 0 0">
        <a href="https://realreal.cc/my-account" style="color:#10305a;font-weight:600">
          點此領取專屬推薦碼 →
        </a>
      </p>
    </div>

    <div style="background:#f6f8fa;border-radius:10px;padding:16px 18px;margin:20px 0">
      <p style="margin:0"><strong>⭐ 與誠真一起，讓好的事情發生</strong></p>
      <p style="margin:8px 0 0">我們珍惜每一位願意分享心得、提供建議、參與品牌成長的朋友。</p>
      <p style="margin:8px 0 0">您與品牌的互動，會成為會員權益升級的參考。獲邀升級的會員，
         將有機會參與線上或線下活動、新品試喝體驗，以及更多專屬禮遇。</p>
    </div>

    <p>對誠真來說，重要的不只是買得多。</p>
    <p>謝謝您讓誠真生活走進日常。</p>
    <p style="margin-top:24px">讓身心輕盈，讓生活誠真。</p>
    <p>誠真生活</p>

    <p style="color:#687279;font-size:13px;margin-top:28px">
      不想再收到這類信件的話，到會員中心把行銷訊息關掉，我們就不會再寄。
    </p>
  </div>`
}
