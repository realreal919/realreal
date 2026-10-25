import { createClient } from "@supabase/supabase-js"
import { supabase } from "./supabase"

/**
 * 驗證「使用者登入 token」專用的 client —— 不要用 service-role 的那個。
 *
 * 2026-10-25 把 Supabase 的 legacy JWT API keys 停用之後，用 secret 金鑰呼叫
 * auth.getUser(使用者token) 一律回 Invalid token，於是所有經過 requireAuth 的
 * 後台 API 全部 401、頁面變成空白。前台不受影響，因為它走的是公開端點 —— 這也
 * 是當下唯一的線索：同一個 token 直接打 Supabase（apikey 用 publishable）是 200，
 * 打我們的 API 是 401，差別只在 apikey 標頭帶的是哪一把金鑰。
 *
 * 驗證一個使用者的身分本來就不需要最高權限的金鑰，publishable 才是對的工具。
 *
 * 刻意放在獨立檔案而不是 lib/supabase.ts：那支被二十幾個測試用 vi.mock 換掉，
 * 在那裡多一個 export 會讓每一個 mock 都少一個欄位而整批失敗。
 *
 * 沒設 SUPABASE_PUBLISHABLE_KEY 時退回原本的 client，行為跟改版前一模一樣 ——
 * 不會因為少設一個環境變數就整個後台登不進去。
 */
const url = process.env.SUPABASE_URL
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

export const authVerifier =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : supabase
