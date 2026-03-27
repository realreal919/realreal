# 誠真生活 RealReal — 全客製化重寫設計文件

**日期：** 2026-03-26
**品牌：** 誠真生活 RealReal（realreal.cc）
**目標：** 將現有 WordPress/WooCommerce 網站重寫為全客製化 Next.js 應用

---

## 1. 專案背景

### 現有網站
- **平台：** WordPress 6.9.4 + WooCommerce + Blocksy + Elementor Pro
- **品牌：** 台灣純素植物蛋白粉 + 凍乾水果 DTC 電商
- **商品：** 23 個上架商品（TWD 55–3,180）
- **用戶：** 51 位註冊用戶，62 位顧客紀錄，73 筆歷史訂單
- **支付（現有）：** PChomePay、LINE Pay、JKOPay
- **物流（現有）：** 綠界 ECPay（7-11/全家超商取貨 + 黑貓宅配）
- **發票（現有）：** Amego API（二聯/三聯式）
- **會員（現有）：** 累積消費分級制（自訂 PHP snippet）

### 新增功能
- 訂閱制：補貨型自動扣款 + 付費會員月費制
- 完整客製後台（銷售報表、訂閱管理、物流追蹤、發票管理）

---

## 2. 技術架構

### 部署架構
```
Frontend：  Next.js 15 App Router on Vercel
Backend：   Express.js API + BullMQ Worker on Railway
Database：  Supabase (PostgreSQL + Auth + Storage)
Cache/Queue：Upstash Redis
```

### 架構圖
```
Vercel (Next.js)
├── App Router Pages（SSR/SSG）
├── Server Actions（購物車、帳號操作）
└── Route Handlers（金流/物流 webhook 接收 + 驗簽）
        │
        │ HTTP（附帶 INTERNAL_API_SECRET header）
        ▼
Railway (Express API)
├── REST API（訂單、金流、物流、發票、會員、訂閱、後台）
└── Workers (BullMQ)
    ├── subscription-billing（每日 08:00 CST）
    ├── invoice-issuer（自動開立發票）
    ├── logistics-sync（每 2 小時同步物流狀態）
    └── email-sender（事件觸發寄信）
        │
        ▼
Supabase (PostgreSQL + Auth + Storage)
Upstash Redis（購物車 session、BullMQ queue、rate limiting）
```

### 外部 API 串接
| 服務 | 用途 |
|------|------|
| PChomePay 支付連 | 信用卡/ATM 金流（支援 PChomePay Token 定期扣款） |
| LINE Pay Online API v3 | LINE Pay 金流（不支援 token 扣款，訂閱需 redirect 授權） |
| JKOPay API | 街口支付金流（不支援 token 扣款，訂閱需 redirect 授權） |
| 綠界 ECPay 物流 API | 超商取貨 + 黑貓宅配 |
| Amego API | 電子發票開立/作廢 |

---

## 3. 認證架構（Auth Flow）

### 使用者認證（Supabase Auth）
- **方式：** Email + 密碼（主要）；未來可加 LINE OAuth
- **Session 管理：** Supabase Auth JWT，存在 httpOnly cookie（`sb-access-token`）
- **Next.js → Railway 信任模型：**
  - 前端呼叫 Railway API 時，Next.js Server Action 從 Supabase session 取得 JWT
  - 將 JWT 附加至 `Authorization: Bearer {jwt}` header 傳給 Railway
  - Railway middleware 向 Supabase 驗證 JWT（`supabase.auth.getUser(jwt)`）
  - Server-to-server 內部呼叫（如 Worker 建立訂單）額外帶 `X-Internal-Secret: {INTERNAL_API_SECRET}` header

### Admin Role
- Supabase `user_profiles.role` 欄位（`customer` | `admin`）
- Railway middleware 驗證 JWT 後，從 DB 查詢 `role = admin` 才允許 `/admin/*` 路由
- Admin 用戶由資料庫 seed script 手動建立（`npm run seed:admin`）；腳本從環境變數讀取帳密（非互動式），具冪等性（已存在則跳過），CI/CD pipeline 不執行此腳本（由 `NODE_ENV !== production` guard 防止意外執行）
- 前台 `/admin/*` 路由由 Next.js middleware 額外防護（role 不符 → redirect `/`）
- Admin 使用同一個 `/auth/login` 頁面登入，登入後依 role 導向後台

### Guest Checkout
- 訪客可不登入完成結帳；`orders.user_id = null`，`orders.guest_email` 儲存聯絡 email
- 訂單確認信寄至 `guest_email`
- 若訪客之後註冊，可在 `/my-account/orders` 頁輸入訂單編號 + email 認領歷史訂單（更新 `orders.user_id`）
- Cart session 由 Redis `cart:{session_id}` 管理，`session_id` 存在 httpOnly cookie

---

## 4. 訂閱付款模型

### 支援定期扣款的金流
| 金流 | Token 扣款 | 機制 |
|------|-----------|------|
| PChomePay | ✅ 支援 | 首次授權時取得 `payment_token`，後續呼叫 TokenCharge API |
| LINE Pay | ❌ 不支援 token | 每次扣款發送付款連結 email，用戶點擊完成付款（semi-manual） |
| JKOPay | ❌ 不支援 token | 同 LINE Pay，email 提醒 + 付款連結 |

**訂閱付款策略：**
- 建立訂閱時，強制選擇 **PChomePay** 作為訂閱付款方式（自動扣款唯一選項）
- LINE Pay / JKOPay 僅供一次性訂單使用
- `subscriptions.payment_method_token` 儲存 PChomePay 回傳的 token
- Token 加密：欄位使用 PostgreSQL `pgcrypto` 的 `encrypt()` 對稱加密（AES-256），解密密鑰存於 Railway 環境變數 `PAYMENT_TOKEN_ENCRYPTION_KEY`
- **Key Rotation：** 初期使用單一靜態密鑰。若需輪換（如密鑰洩漏），流程為：(1) 新增環境變數 `PAYMENT_TOKEN_ENCRYPTION_KEY_V2`；(2) 執行 `scripts/rotate-payment-tokens.ts` 腳本，以舊鑰解密、新鑰重加密所有 active subscriptions 的 token；(3) 完成後移除舊密鑰。`subscriptions` 表預留 `token_key_version INT DEFAULT 1` 欄位供多版本解密過渡期使用

---

## 5. Webhook 安全設計

### 架構
```
金流 Server → POST /api/webhooks/{gateway} (Next.js)
  → 驗簽成功 → 轉發至 Railway POST /payments/notify/{gateway}
                附帶 X-Internal-Secret: {INTERNAL_API_SECRET}
  → 驗簽失敗 → 回傳 400，記錄 IP
```

### 各金流驗簽方式
| 金流 | 驗簽方式 |
|------|---------|
| PChomePay | HMAC-SHA256，使用 `PCHOMEPAY_HASH_KEY` + `PCHOMEPAY_HASH_IV` 驗證 CheckMacValue |
| LINE Pay | HMAC-SHA256，使用 `LINEPAY_CHANNEL_SECRET` 驗證 X-LINE-Authorization header |
| JKOPay | RSA 公鑰驗簽，使用 JKOPay 提供的公鑰驗證 signature 欄位 |
| ECPay 物流 | HMAC-SHA256，使用 `ECPAY_HASH_KEY` + `ECPAY_HASH_IV` 驗證 CheckMacValue |

### 防重放攻擊
- 每個 webhook 攜帶 `MerchantTradeNo`（訂單編號）
- Railway 記錄已處理的 `MerchantTradeNo`，重複通知回傳 200 但不重複處理
- Webhook endpoint rate limit：每 IP 每分鐘 60 次

---

## 6. 資料庫 Schema（Supabase PostgreSQL）

> 所有時間戳欄位使用 `TIMESTAMPTZ`，應用層時區為 `Asia/Taipei`（UTC+8）

### 商品系統
```sql
categories (id, name, slug, parent_id, sort_order)

products (id, name, slug, description, category_id, images JSONB, is_active, created_at)

product_variants (
  id, product_id, sku, name, price, sale_price, stock_qty, weight,
  attributes JSONB  -- e.g. {"flavor": "草莓", "weight_g": 50, "unit": "包"}
  -- 用於前端變體選擇器 UI，key 統一為 flavor / weight_g / unit
)
```

### 訂單系統
```sql
orders (
  id UUID, order_number TEXT,         -- e.g. RR-20260326-0001
  user_id UUID nullable FK auth.users,
  guest_email TEXT nullable,          -- 訪客結帳聯絡信箱
  status: pending|processing|shipped|completed|cancelled|failed,
  subtotal, shipping_fee, discount_amount, total,
  payment_method: pchomepay|linepay|jkopay,
  payment_status: pending|paid|failed|refunded,
  shipping_method: cvs_711|cvs_family|home_delivery,
  invoice_id UUID, metadata JSONB,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
order_items (id, order_id, variant_id, product_snapshot JSONB, qty, unit_price)
order_addresses (
  id, order_id, type: billing|shipping,
  name, phone, email,
  address_type: home|cvs,
  cvs_store_id, cvs_type: 711|family,
  address, city, postal_code
)
```

### 金流 & 物流
```sql
payments (id, order_id, gateway, gateway_tx_id, amount, status, raw_response JSONB, paid_at TIMESTAMPTZ)
logistics (
  id, order_id, provider: ecpay,
  type: CVS_UNIMART|CVS_FAMI|HOME_TCAT,
  ecpay_logistics_id, tracking_number,
  cvs_payment_no, cvs_validation_no,
  status, shipped_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, raw_response JSONB
)
webhook_events (
  id, gateway, merchant_trade_no, payload JSONB,
  processed_at TIMESTAMPTZ,          -- 防重放：有記錄則略過
  UNIQUE (gateway, merchant_trade_no) -- DB 層唯一約束，防並發競爭
  -- Railway handler 必須在同一 DB transaction 內：
  -- 1. INSERT INTO webhook_events（若 unique constraint 衝突則 SKIP）
  -- 2. 更新 order status
  -- 確保 crash recovery 不會重複處理
)
```

### 電子發票
```sql
invoices (
  id, order_id, invoice_number,
  type: B2C_2|B2C_3|B2B,
  tax_id TEXT nullable,
  amount, tax_amount,
  status: pending|issued|voided,
  amego_id, issued_at TIMESTAMPTZ, voided_at TIMESTAMPTZ
)
```

**發票作廢觸發條件：**
- 只有 `admin` 或系統（訂閱取消 worker）可觸發取消訂單
- 取消訂單時：先呼叫 Amego API 作廢發票（成功後才更新 order status = cancelled）
- 部分退款：本次不實作，列為未來功能

### 會員系統
```sql
membership_tiers (id, name, min_spend, discount_rate, benefits JSONB)
user_profiles (
  user_id UUID PK FK auth.users,
  display_name, phone, birthday DATE, tax_id,
  total_spend NUMERIC DEFAULT 0,
  membership_tier_id FK,
  role: customer|admin DEFAULT customer,
  created_at TIMESTAMPTZ
)
```

### 訂閱系統
```sql
subscription_plans (
  id, name, type: membership|replenishment,
  interval: monthly|bimonthly,
  price,
  variant_id UUID nullable FK product_variants,
  qty INT nullable,
  benefits JSONB,   -- e.g. {"discount_rate": 0.1, "free_shipping": true}
  is_active
)
subscriptions (
  id, user_id FK auth.users, plan_id FK subscription_plans,
  type: membership|replenishment,
  status: active|paused|cancelled|past_due,
  payment_method: pchomepay,          -- 訂閱僅支援 PChomePay
  payment_method_token TEXT,           -- AES-256 加密存儲
  retry_count INT DEFAULT 0,           -- 失敗重試計數
  current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ,
  next_billing_date DATE,              -- 以 Asia/Taipei 日期計算
  created_at TIMESTAMPTZ
)
subscription_orders (
  id, subscription_id, order_id,
  billing_cycle INT,         -- 從 1 開始自增，取該訂閱最後一筆 billing_cycle + 1
  status, idempotency_key TEXT UNIQUE  -- = sub_{id}_{YYYY-MM-DD}（Asia/Taipei 扣款日期）
)
```

### 優惠券
```sql
coupons (
  id, code, type: percentage|fixed, value, min_order,
  max_uses, used_count, expires_at TIMESTAMPTZ,
  applicable_to: order|subscription|both DEFAULT order  -- 適用範圍
)
coupon_uses (id, coupon_id, user_id, order_id, subscription_id nullable, used_at TIMESTAMPTZ)
```

### Redis（Upstash）
```
cart:{session_id}          HASH { variant_id: qty }  TTL 7天
rate:{ip}:{endpoint}       計數器                     TTL 60s
webhook:processed:{tradeNo} EXISTS 快速檢查（24h TTL）  -- 快速 early-exit；TTL 到期後回退至 DB UNIQUE constraint，DB 為最終權威
```

---

## 7. Railway API 端點

### 訂單 & 金流
```
POST   /orders                       建立訂單，回傳金流付款 URL
GET    /orders/:id                   查詢訂單
POST   /orders/:id/cancel            取消訂單（admin 或系統專用）
POST   /payments/notify/pchome       PChomePay 付款回調
POST   /payments/notify/linepay      LINE Pay 付款回調
POST   /payments/notify/jkopay       JKOPay 付款回調
```

### 物流
```
POST   /logistics/create/:orderId    建立綠界出貨單
POST   /logistics/notify             綠界物流狀態回調
GET    /logistics/:orderId           查詢物流狀態
```

### 發票
```
POST   /invoices/issue/:orderId      手動補開發票
POST   /invoices/void/:orderId       作廢發票
```

### 會員
```
GET    /members/:userId              查詢會員資料 + 等級
PUT    /members/:userId              更新會員資料
GET    /members/:userId/orders       訂單歷史
POST   /members/:userId/claim-order  認領訪客訂單（輸入訂單編號 + guest_email）
```

### 訂閱
```
POST   /subscriptions                建立訂閱
PUT    /subscriptions/:id/pause      暫停
PUT    /subscriptions/:id/resume     恢復
DELETE /subscriptions/:id            取消
```

### 後台 Admin（需 admin role JWT）
```
GET    /admin/orders                 訂單列表（篩選/分頁）
PUT    /admin/orders/:id/status      更新訂單狀態
GET/POST/PUT  /admin/products        商品 CRUD
GET    /admin/members                會員列表
PUT    /admin/members/:id/tier       手動調整會員等級
GET    /admin/subscriptions          訂閱列表
GET    /admin/invoices               發票列表
POST   /admin/invoices/:id/reissue   補開發票
GET    /admin/reports/sales          銷售報表（日/週/月）
GET    /admin/reports/products       商品銷售排行
```

---

## 8. Workers 設計

### subscription-billing（每日 08:00 CST = 00:00 UTC）
1. 查詢 `next_billing_date = today（Asia/Taipei）` 且 `status = active` 的訂閱
2. 為每筆訂閱生成 `idempotency_key = sub_{id}_{YYYY-MM-DD}`（Asia/Taipei 扣款日期，防重複扣款）
3. 若 `subscription_orders` 已存在相同 `idempotency_key` → 跳過（已處理）
4. 呼叫 PChomePay Token Charge API
5. 成功 → 建立 order → 建立 logistics → 更新 `next_billing_date` → `retry_count = 0`
6. 失敗 → `retry_count += 1`
   - retry_count 1–3：隔 2 天重試（BullMQ delayed job）
   - retry_count > 3：`status = past_due` → email 通知用戶 → 7 天內補款否則暫停

### invoice-issuer（order status → processing 時觸發）
1. 讀取訂單 billing 資料
2. 有統編 → 三聯式（B2B）；無統編 → 二聯式（B2C）
3. 呼叫 Amego API 開立發票
4. 寫入 invoices table
5. email 寄發票通知

### logistics-sync（每 2 小時）
1. 查詢 `status = shipped` 物流單
2. 呼叫綠界查詢 API
3. 到貨 → `order.status = completed`
4. `shipped_at` 超過 14 天仍未到貨 → `logistics.status = stalled`，後台標記為需人工處理，email 通知 admin

### email-sender（事件觸發）
- 訂單確認、出貨通知（含取貨碼）、發票寄送
- 訂閱扣款成功/失敗通知、past_due 警告

---

## 9. 前端頁面結構（Next.js App Router）

```
app/
├── (storefront)/
│   ├── page.tsx                     首頁
│   ├── about/page.tsx               品牌故事
│   ├── membership/page.tsx          會員制度說明
│   ├── products/
│   │   ├── page.tsx                 商品總覽
│   │   ├── [slug]/page.tsx          商品詳情（variant 選擇器由 attributes JSONB 驅動）
│   │   ├── plant-shop/page.tsx      植物蛋白專區
│   │   └── fruit-shop/page.tsx      凍乾水果專區
│   ├── cart/page.tsx                購物車
│   ├── checkout/
│   │   ├── page.tsx                 結帳
│   │   ├── payment/page.tsx         金流跳轉等待頁
│   │   └── result/page.tsx          付款結果頁
│   ├── blog/
│   │   ├── page.tsx                 部落格列表
│   │   └── [slug]/page.tsx          文章頁（初期：MDX 靜態檔案）
│   ├── recipes/page.tsx             食譜（初期：MDX 靜態檔案）
│   └── contact/page.tsx             聯絡我們
│
├── (account)/
│   ├── my-account/
│   │   ├── page.tsx                 帳號總覽
│   │   ├── orders/
│   │   │   ├── page.tsx             訂單列表
│   │   │   └── [id]/page.tsx        訂單詳情 + 物流追蹤
│   │   ├── subscriptions/
│   │   │   ├── page.tsx             訂閱管理
│   │   │   └── [id]/page.tsx        訂閱詳情
│   │   ├── profile/page.tsx         個人資料（生日、統編）
│   │   └── invoices/page.tsx        發票查詢
│   └── auth/
│       ├── login/page.tsx
│       ├── register/page.tsx
│       └── forgot-password/page.tsx
│
├── (admin)/
│   └── admin/
│       ├── page.tsx                 Dashboard（銷售總覽）
│       ├── orders/
│       │   ├── page.tsx             訂單管理（篩選/搜尋/分頁）
│       │   └── [id]/page.tsx        訂單詳情 + 手動操作
│       ├── products/
│       │   ├── page.tsx             商品列表
│       │   ├── new/page.tsx         新增商品
│       │   └── [id]/page.tsx        編輯商品
│       ├── members/page.tsx         會員管理
│       ├── subscriptions/page.tsx   訂閱管理
│       ├── invoices/page.tsx        發票管理（補開/作廢）
│       └── reports/page.tsx         銷售報表
│
└── api/webhooks/
    ├── pchome/route.ts              驗簽後轉發至 Railway
    ├── linepay/route.ts
    ├── jkopay/route.ts
    └── ecpay/route.ts
```

**UI：** shadcn/ui + Tailwind CSS + Geist 字型
**風格：** 前台延續 earth-tone 極簡設計；後台暗色主題

---

## 10. 台灣在地整合細節

### 金流流程
1. 用戶下單 → Railway 呼叫金流 API → 回傳付款 URL → 前端跳轉
2. 付款完成 → 金流打 notify 至 Next.js `/api/webhooks/{gateway}`
3. Next.js 驗簽（各金流方式詳見 Section 5）→ 轉發給 Railway
4. Railway 查 `webhook_events` 確認未處理 → 更新訂單狀態 → 觸發發票 + 出貨通知

### 綠界物流流程
1. 後台建立出貨單 → Railway 呼叫 ECPay 物流 API
2. 取得取貨碼（超商）或托運單號（宅配）→ email 通知顧客
3. Worker 每 2 小時同步狀態 → 到貨自動完成訂單

### 電子發票流程
1. 訂單 `processing` → invoice-issuer worker 呼叫 Amego API
2. 有統編 → 三聯式；無統編 → 二聯式
3. 訂單取消 → 先作廢發票（成功後）→ 再更新 order.status = cancelled

### 訂閱制流程
- **補貨型：** 每月自動以 PChomePay token 扣款 → 建立訂單 → 自動出貨 → 自動開票
- **付費會員型：** 月費扣款 → subscription.status = active → 享折扣
- **失敗處理：** 重試 3 次（隔 2 天）→ past_due → email 通知 → 7 天補款否則暫停

---

## 11. 資料遷移計畫

### 遷移範圍
| 資料 | 遷移方式 |
|------|---------|
| 商品（23 筆）+ 圖片 | 腳本從 WooCommerce DB 匯出，圖片從 WordPress uploads 上傳至 Supabase Storage |
| 歷史訂單（73 筆） | 匯入為 read-only（status = completed/cancelled），不可編輯 |
| 用戶（51 位） | 帳號資料匯入 user_profiles，密碼**不遷移**；用戶首次登入時觸發「重設密碼」流程 |
| 商品分類 | 手動對應至新 categories schema |
| 部落格文章 | 匯出為 MDX 靜態檔案（初期靜態，未來接 CMS） |

### 遷移腳本
- `scripts/migrate-products.ts`
- `scripts/migrate-orders.ts`
- `scripts/migrate-users.ts`

---

## 12. 環境變數清單

### Vercel（Next.js）
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
RAILWAY_API_URL               # Railway API 內部 URL
INTERNAL_API_SECRET           # Next.js ↔ Railway 內部通信密鑰
PCHOMEPAY_HASH_KEY
PCHOMEPAY_HASH_IV
LINEPAY_CHANNEL_SECRET
JKOPAY_PUBLIC_KEY             # 用於驗簽
```

### Railway（API + Worker）
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY     # 服務端完整權限
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
INTERNAL_API_SECRET
PAYMENT_TOKEN_ENCRYPTION_KEY  # AES-256 密鑰（訂閱 token 加密）
PCHOMEPAY_MERCHANT_ID
PCHOMEPAY_HASH_KEY
PCHOMEPAY_HASH_IV
LINEPAY_CHANNEL_ID
LINEPAY_CHANNEL_SECRET
JKOPAY_STORE_ID
JKOPAY_API_KEY
ECPAY_MERCHANT_ID
ECPAY_HASH_KEY
ECPAY_HASH_IV
AMEGO_TAX_ID                  # 60515111
AMEGO_APP_KEY
EMAIL_SMTP_HOST               # 寄信服務（Resend 或 SMTP）
EMAIL_SMTP_USER
EMAIL_SMTP_PASS
TZ=Asia/Taipei
```

---

## 13. 可觀測性 & 錯誤處理

- **錯誤追蹤：** Sentry（Next.js + Railway 各自安裝）
- **結構化日誌：** Railway 使用 `pino`，輸出 JSON logs
- **Worker 告警：** BullMQ failed jobs → Sentry alert → email 通知 admin
- **關鍵監控指標：**
  - 訂閱扣款失敗率
  - Webhook 處理失敗
  - 物流同步異常

---

## 14. 開發方式

所有模組同步並行開發：
- 前台電商核心（商品、購物車、結帳）
- 會員 & 認證系統
- 訂閱系統
- 後台管理介面
- Railway API & Workers
- 資料庫 migrations + 遷移腳本

---

## 15. 未來規劃（本次不實作）

- Headless CMS（Sanity）接管部落格/食譜內容
- Cloudflare R2 取代 Supabase Storage
- LINE 官方帳號通知整合
- 部分退款 + 信用單（發票）
- LINE OAuth 登入
