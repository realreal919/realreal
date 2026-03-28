# RealReal 誠真生活 — QA 測試報告

> 測試日期：2026-03-28
> 測試方式：15 個 QA Agent 平行掃描全站代碼

## 測試範圍

- 前端頁面：首頁、商店、認證、結帳、會員中心、管理後台 (19 模組)、部落格、靜態頁面、訂閱
- API 路由：商品、訂單、Webhook、訂閱、使用者、CMS、媒體、行銷、優惠券
- 中間件 & Workers：Auth、Admin、Editor、email-sender、subscription-billing、invoice-issuer
- 資料庫 Schema & 遷移
- Email 模板 & 部署設定

## Bug 統計摘要

| 嚴重程度 | 數量 | 說明 |
|----------|------|------|
| **CRITICAL** | 15 | 系統崩潰、安全漏洞、核心功能損壞 |
| **HIGH** | 35 | 功能錯誤、Auth 缺失、資料不一致 |
| **MEDIUM** | 80 | Error handling、UX、TypeScript 型別 |
| **LOW** | 60 | 一致性、無障礙、SEO |
| **總計** | **~190** | |

---

## 1. 首頁 + 商店 (8 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | CRITICAL | `components/product/AddToCartSection.tsx:25` | 空 variants 陣列未處理，price 顯示 0 |
| 2 | CRITICAL | `app/shop/[slug]/page.tsx:131` | XSS：product.description 用 dangerouslySetInnerHTML 無 sanitize |
| 3 | HIGH | `app/shop/page.tsx:16` | getProducts() 失敗無 error boundary，整頁 500 |
| 4 | HIGH | `lib/cart.ts:40` | Cart persist hydration mismatch，localStorage 失敗無處理 |
| 5 | HIGH | `app/page.tsx:345` | fallback posts 用 title 做 key，可能重複 |
| 6 | MEDIUM | `components/product/AddToCartSection.tsx:32` | price 為 string，Number() 可能 NaN |
| 7 | MEDIUM | `components/product/ReviewForm.tsx:35` | 錯誤回應 JSON 結構未驗證 |
| 8 | LOW | `app/shop/[slug]/page.tsx:25` | 星等缺 aria-label |

## 2. Auth 頁面 (12 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | CRITICAL | `auth/reset-password/page.tsx:20` | 未從 URL hash 取出 reset token |
| 2 | HIGH | `auth/actions.ts:41` | 註冊後未驗證 email confirmation 狀態 |
| 3 | HIGH | `auth/actions.ts:47` | 註冊成功無 redirect |
| 4 | MEDIUM | `auth/login/page.tsx:83` | Google OAuth 按鈕 disabled 但顯示 |
| 5 | MEDIUM | `auth/register/page.tsx:71` | 密碼驗證僅 client-side minLength=8 |
| 6 | MEDIUM | `auth/callback/route.ts:8` | next 參數未驗證，open redirect 風險 |
| 7 | MEDIUM | `auth/register/page.tsx:65` | 缺密碼確認欄位 |
| 8 | MEDIUM | — | 缺 middleware.ts 保護認證路由 |
| 9 | LOW | `auth/register/page.tsx:79` | error message 可能含 user input (XSS) |
| 10 | LOW | — | 無顯式 CSRF token (Next.js 內建處理) |
| 11 | LOW | — | 送出時 input 未 disabled |
| 12 | LOW | — | Inline style 硬編碼顏色 |

## 3. 結帳流程 (13 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | CRITICAL | `checkout/payment/page.tsx:150` | unitPrice 未轉換為 cents |
| 2 | HIGH | `checkout/page.tsx` vs `api/routes/orders.ts` | shipping method enum 不符 ("711" vs "cvs_711") |
| 3 | HIGH | `checkout/payment/page.tsx:148` | discount 金額未送到 API |
| 4 | HIGH | `checkout/payment/page.tsx:150` | cvsStoreId 未含在 address |
| 5 | HIGH | `checkout/page.tsx:187` | 空購物車可繼續到下一步 |
| 6 | MEDIUM | `checkout/page.tsx:235` | email 格式未驗證 |
| 7 | MEDIUM | `components/cart/CartDrawer.tsx:92` | 快速點擊減號 race condition |
| 8 | MEDIUM | `lib/cart.ts:36` | 負數 qty 被接受 |
| 9 | MEDIUM | `checkout/page.tsx:413` | 超商門市名稱為自由輸入 |
| 10 | MEDIUM | `checkout/page.tsx:126` | 空白姓名/電話通過驗證 |
| 11 | MEDIUM | `checkout/page.tsx:175` | total 可能為 NaN 無保護 |
| 12 | LOW | `checkout/page.tsx:305` | 郵遞區號無格式驗證 |
| 13 | MEDIUM | `lib/cart.ts:40` | 小數價格精度遺失 |

## 4. 我的帳號 (10 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | CRITICAL | `my-account/profile/page.tsx` | Client component，auth check 在 useEffect，未認證用戶可短暫看到表單 |
| 2 | CRITICAL | `my-account/addresses/page.tsx` | 無 auth guard + 地址存 localStorage 不存 DB |
| 3 | HIGH | `my-account/page.tsx:200` vs `SubscriptionCard.tsx:70` | interval 值不一致 ("month" vs "monthly") |
| 4 | MEDIUM | `my-account/page.tsx:48` | API 失敗靜默回傳空陣列 |
| 5 | MEDIUM | `components/subscriptions/SubscriptionCard.tsx:57` | 操作後無 optimistic update |
| 6 | MEDIUM | `my-account/orders/[id]/page.tsx:100` | 已取消訂單 timeline 計算問題 |
| 7 | MEDIUM | `my-account/orders/page.tsx` | 缺 loading skeleton |
| 8 | MEDIUM | `my-account/profile/page.tsx` | profile 載入失敗無 error UI |
| 9 | LOW | — | redirect 方式不一致 (redirect vs router.push) |
| 10 | LOW | — | 空 catch blocks |

## 5. 管理後台 Dashboard (8 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | CRITICAL | `admin/page.tsx:12` | Promise.all 任一查詢失敗整頁崩潰 |
| 2 | CRITICAL | `admin/products/page.tsx:15` | Role check 過嚴，只允許 admin 不允許 editor |
| 3 | HIGH | `admin/products/page.tsx:18` | products 可能 undefined |
| 4 | MEDIUM | `admin/analytics/page.tsx:15` | Chart data 查詢無 error handling |
| 5 | MEDIUM | `admin/orders/[id]/actions.ts:6` | CRUD action 錯誤未捕獲 |
| 6 | MEDIUM | `admin/` | 缺 error.tsx boundary |
| 7 | LOW | `admin/products/page.tsx:12` | 重複 auth check (layout 已做) |
| 8 | LOW | `admin/subscriptions/page.tsx:46` | N+1 query |

## 6. 管理後台 Content (9 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | CRITICAL | `admin/media/_components/*.tsx` | Media PATCH/DELETE 缺認證 |
| 2 | CRITICAL | `admin/media/page.tsx:43` | SSR fetch 缺 Authorization header |
| 3 | HIGH | `components/editor/EditorToolbar.tsx:81` | 圖片 URL 未驗證 (XSS) |
| 4 | HIGH | `components/editor/EditorToolbar.tsx:69` | 連結 URL 未驗證 (javascript: XSS) |
| 5 | MEDIUM | `admin/posts/_components/PostForm.tsx:196` | 封面圖載入失敗靜默隱藏 |
| 6 | MEDIUM | `admin/posts/_components/PostForm.tsx:286` | scheduled_at 未驗證是否在未來 |
| 7 | MEDIUM | `components/editor/EditorToolbar.tsx:72` | window.prompt() UX 不佳 |
| 8 | MEDIUM | `admin/media/_components/*.tsx` | XHR 缺 credentials |
| 9 | LOW | — | 認證模式不一致 (Bearer vs credentials) |

## 7. 管理後台 Subscriptions/Coupons/Campaigns/Reviews/Invoices (21 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | CRITICAL | `admin/coupons/page.tsx` | 優惠券缺編輯/刪除 UI |
| 2 | HIGH | `admin/subscriptions/page.tsx:113` | unsafe 型別強制轉換 |
| 3 | HIGH | `admin/subscriptions/page.tsx:39` | 硬編碼 limit(500) 無分頁 |
| 4 | HIGH | `admin/reviews/_client.tsx` | 缺分頁 |
| 5 | HIGH | `admin/invoices/page.tsx:52` | 缺分頁 |
| 6 | HIGH | `admin/invoices/page.tsx:124` | form POST 無 CSRF 保護 |
| 7-21 | MEDIUM-LOW | 各頁面 | error handling、validation、state management、styling 等 |

## 8. Blog + 靜態頁面 + 訂閱 (22 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | CRITICAL | `app/search/page.tsx:4` | 缺 SEO metadata |
| 2 | CRITICAL | 多個頁面 | 缺 OpenGraph image |
| 3 | HIGH | `subscribe/page.tsx`, `subscribe/[planId]` | 訂閱頁面缺認證 |
| 4 | HIGH | `subscribe/[planId]/page.tsx:67` | payment token 未驗證格式 |
| 5 | MEDIUM | — | Blog 分頁邊界、FAQ fallback、contact form validation 等 |
| 6-22 | MEDIUM-LOW | — | interval label 不一致、type safety、UX 問題 |

## 9. API Products/Orders/Webhooks (22 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | **CRITICAL** | `webhooks/*.ts`, `orders.ts` | **`payment_transactions` 表不存在**（代碼引用但 schema 是 `payments`） |
| 2 | **CRITICAL** | `routes/orders.ts` | **缺付款啟動端點** (POST /orders/:orderId/pay) |
| 3 | CRITICAL | `routes/variants.ts:80` | Stock update 非原子操作 (race condition) |
| 4 | HIGH | `routes/orders.ts:8` | Client 提供 unitPrice，可被篡改 |
| 5 | HIGH | `routes/orders.ts:36` | 缺訂單冪等性保護 |
| 6 | HIGH | `webhooks/*.ts` | 狀態轉換未驗證當前狀態 |
| 7 | HIGH | `routes/variants.ts:80` | Stock endpoint 缺 admin check |
| 8 | MEDIUM | `webhooks/amego.ts:14` | Secret fallback 為空字串 |
| 9 | MEDIUM | `webhooks/linepay.ts` | 缺簽名驗證 |
| 10 | MEDIUM | `routes/orders.ts` | 缺庫存預留機制 |
| 11-22 | MEDIUM-LOW | — | ECPay 缺驗證、金額驗證、silent failures 等 |

## 10. API Subscriptions/Users/CMS (20 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | HIGH | `routes/subscriptions.ts:137` | 訂閱狀態機允許無效轉換 (cancelled → active) |
| 2 | CRITICAL | `routes/media.ts:48,84,22` | Media upload/update/GET 缺認證中間件 |
| 3 | HIGH | `routes/media.ts` | 檔案上傳無 MIME type 白名單 |
| 4 | HIGH | — | HTML content 未 sanitize (XSS) |
| 5 | MEDIUM | `routes/reviews.ts:66` | 評價自動核准無審核 |
| 6 | MEDIUM | `routes/subscriptions.ts:67` | 帳單日期用 30 天而非日曆月 |
| 7-20 | MEDIUM-LOW | — | 分頁、slug 碰撞、N+1、error codes 等 |

## 11. Middleware + Workers (12 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | **CRITICAL** | `workers/` + `webhooks/pchomepay.ts` | **Job 名稱不符**：enqueue "order-paid-email"/"order-paid-invoice"，但 worker 只處理 "low-stock-check" |
| 2 | CRITICAL | `middleware/auth.ts` | JWT token 格式未驗證 |
| 3 | HIGH | `lib/token-encryption.ts` | 加密金鑰透過 RPC 明文傳送 |
| 4 | HIGH | `workers/email-sender.ts:21` | 無 error handling / retry 設定 |
| 5 | HIGH | `workers/subscription-billing.ts:60` | 空 token 解密崩潰 |
| 6 | HIGH | `workers/subscription-billing.ts:106` | Promise.allSettled 結果未檢查 |
| 7 | HIGH | 所有 workers | REDIS_URL 缺少環境變數驗證 |
| 8 | HIGH | `workers/invoice-issuer.ts:13` | 缺 null safety |
| 9 | MEDIUM | `workers/invoice-issuer.ts:46` | 錯誤訊息可能洩漏敏感資訊 |
| 10 | MEDIUM | `jobs/low-stock-alert.ts:19` | 低庫存只 log 不通知 |
| 11 | MEDIUM | `middleware/editor.ts:12` | Role escalation 風險 |
| 12 | MEDIUM | `workers/subscription-billing.ts:77` | to 欄位傳 user_id 而非 email |

## 12. Layout + Components (7 bugs)

| # | 嚴重度 | 檔案 | 問題 |
|---|--------|------|------|
| 1 | HIGH | `components/layout/Header.tsx:180` | Mobile submenu state 未隔離 |
| 2 | MEDIUM | `components/layout/StorefrontShell.tsx:18` | min-height 計算不正確 |
| 3 | MEDIUM | `components/layout/Header.tsx:22` | /about#charity 錨點不存在 |
| 4 | MEDIUM | `components/layout/Footer.tsx:18` | /impact, /smart-living 頁面不存在 |
| 5 | MEDIUM | `admin/layout.tsx:84` | Admin sidebar 缺 active route 指示 |
| 6 | LOW | `components/layout/Header.tsx:237` | Marquee 動畫可能不連續 |
| 7 | LOW | `app/layout.tsx:35` | 缺 ThemeProvider |

## 13. DB Schema (28 bugs)

| 類別 | 數量 | 說明 |
|------|------|------|
| 缺 CASCADE DELETE | 10 | payments, logistics, invoices, subscription_orders, coupon_uses 等 FK |
| 缺 Schema 定義 | 7 | campaigns, product_reviews, CMS 表等（有 migration 無 schema 檔） |
| 缺 Schema 欄位 | 7 | invoice extensions, charity_savings, tier_id, search_vector |
| 缺索引 | 2 | payments composite, subscriptions plan_id |
| 約束問題 | 2 | orders 需 user_id OR guest_email, webhook payload NOT NULL |

## 14. Email + Config (21 bugs)

| # | 嚴重度 | 說明 |
|---|--------|------|
| 1 | CRITICAL | .env.example 缺 RESEND_API_KEY |
| 2 | CRITICAL | SubscriptionBilled/Failed 模板未接入 worker |
| 3 | CRITICAL | TOKEN_ENCRYPTION_KEY 命名不一致 |
| 4 | HIGH | subscription billing email to 欄位傳 user_id 非 email |
| 5 | HIGH | 所有 email 缺取消訂閱連結 |
| 6 | HIGH | db package 缺 build script |
| 7 | MEDIUM | Email URL 硬編碼、缺 error handling、XSS |
| 8 | MEDIUM | 缺 lint script (api, db) |
| 9 | MEDIUM | 缺 DATABASE_URL 在 .env.example |
| 10-21 | LOW-MEDIUM | TS target 不一致、ESM/CJS 混用、turbo cache 等 |

---

## 優先修復建議 (Top 10)

| 優先序 | Bug | 影響 |
|--------|-----|------|
| 1 | `payment_transactions` vs `payments` 表名不符 | 所有付款 webhook 崩潰 |
| 2 | 缺付款啟動端點 | 用戶無法付款 |
| 3 | Worker job 名稱不符 | Email 和發票永遠不送出 |
| 4 | 訂單建立缺伺服器端價格驗證 | 價格可被篡改 |
| 5 | Media 端點缺認證 | 未授權用戶可上傳/刪除檔案 |
| 6 | Shipping method enum 不符 | 結帳流程失敗 |
| 7 | SubscriptionBilled/Failed 模板未接入 | 訂閱用戶無通知 |
| 8 | 訂閱狀態機無效轉換 | 已取消訂閱可被恢復 |
| 9 | RESEND_API_KEY + TOKEN_ENCRYPTION_KEY 環境變數 | 部署時崩潰 |
| 10 | 庫存預留機制 | 超賣風險 |
