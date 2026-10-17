/**
 * ECPay 超商取貨 (UNIMARTC2C / FAMIC2C) rejects the ReceiverName unless it is
 * either 2~5 Chinese characters OR 4~10 Latin letters — no digits, spaces or
 * symbols (error 10500036). This is the server-side safety net mirroring the
 * checkout guard in apps/web/src/lib/shipping-preview.ts (validateCvsReceiverName)
 * so a bypassed/buggy client can't create an order that then silently fails
 * logistics creation. Keep both copies in sync.
 *
 * 間隔號（·）is allowed for indigenous names. Returns an error message, or
 * undefined when the name is acceptable for CVS pickup.
 */
export function validateCvsReceiverName(raw: string): string | undefined {
  const n = (raw ?? "").trim()
  if (!n) return "請輸入收件人姓名"
  const pureChinese = /^[一-龥·‧]{2,5}$/.test(n)
  const pureEnglish = /^[A-Za-z]{4,10}$/.test(n)
  if (!pureChinese && !pureEnglish) {
    return "超商取貨姓名須為中文 2~5 字，或英文 4~10 字（不可含數字、空白或符號）"
  }
  return undefined
}

/**
 * Business rule (not an ECPay constraint): reject single-word nicknames like
 * "xuan" so the recipient name entered at checkout actually matches what's
 * on their ID — otherwise 超商取貨 pickup gets refused at the counter.
 *
 * 2026-10-17 放寬：原本的規則把一整類「真名」當成暱稱擋掉，而且擋得毫無退路
 * ——結帳的下一步就是不會過，客人只能離開。被誤擋的至少有三種：
 *   - 超過 5 個字的中文名（原住民族名如「阿將‧伊崮喜瀾」有 7 個字）
 *   - 中間有空白的中文名（「阿布娪 卡阿紛吶」）
 *   - 含連字號或撇號的英文名（Mary-Jane、O'Brien）
 * 這些都是證件上的全名，擋掉它們完全沒有達到「防暱稱」的目的。
 *
 * 現在：中文 2~15 字（可含 ·‧ 與空白分隔）、英文 2~4 個單字（單字內可含
 * 連字號／撇號）或 CamelCase 連寫。單一小寫單字（xuan）照樣擋，那才是暱稱。
 *
 * 超商取貨另有綠界自己的限制（中文 2~5 字 / 英文 4~10 字、不可含空白），
 * 由 validateCvsReceiverName 把關 —— 兩道分開，不要合併。
 */
// 單字＝一般英文字（2 字母以上），或含連字號／撇號的複合字（O'Brien、Mary-Jane）。
// 複合字的第一段只有一個字母也算數 —— O'Brien 的 O 就是。
const NAME_WORD = "(?:[A-Za-z]+(?:['-][A-Za-z]+)+|[A-Za-z]{2,})"
// 用字面空白而不是 \s：名字之間就是空白，而且 \s 寫在樣板字串裡很容易被吃掉一層跳脫。
const SPACED_FULL_NAME = new RegExp(`^${NAME_WORD}(?: ${NAME_WORD}){1,3}$`)
const JOINED_FULL_NAME = /^(?:[A-Z][a-z]{1,9}){2,4}$/
const CHINESE_NAME = /^[一-龥]+(?:[·‧ ][一-龥]+)*$/

export function validateRealName(raw: string): string | undefined {
  const n = (raw ?? "").trim()
  if (!n) return "請輸入收件人姓名"
  if (CHINESE_NAME.test(n)) {
    const chars = n.replace(/[·‧ ]/g, "").length
    if (chars >= 2 && chars <= 15) return undefined
  }
  if (SPACED_FULL_NAME.test(n) || JOINED_FULL_NAME.test(n)) return undefined
  return "請輸入完整真實姓名（例如：王小明 / Xuan Chen），須與證件相同以利取貨，不接受暱稱"
}

// 與 apps/web/src/lib/shipping-preview.ts 的同名函式完全一致，改一邊要改兩邊。
