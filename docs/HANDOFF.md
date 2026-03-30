# RealReal 誠真生活 — 專案交接文件

> 最後更新：2026-03-28

## 1. 專案概述

RealReal 誠真生活是台灣在地純素健康食品品牌的電商平台重寫專案，從 WordPress/WooCommerce 遷移到現代化 TypeScript 全端架構。

- **產品線**：純素植物蛋白粉、凍乾水果、禮盒組合
- **商業模式**：DTC 電商 + 訂閱制 + 會員等級制度
- **舊站**：WordPress 6.9.4 + WooCommerce + Blocksy + Elementor Pro

## 2. 技術架構

```
┌─────────────────────┐
│  Vercel (Frontend)   │  Next.js 15 + React 19 + Tailwind + shadcn/ui
└──────────┬──────────┘
           │ INTERNAL_API_SECRET
┌──────────▼──────────┐
│  Railway (Backend)   │  Express.js 5 + BullMQ Workers
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Supabase            │  PostgreSQL + Auth (JWT) + Storage
└─────────────────────┘
┌─────────────────────┐
│  Upstash Redis       │  BullMQ 佇列 + 快取
└─────────────────────┘
```

| 層級 | 技術 |
|------|------|
| 前端 | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, Zustand |
| 後端 | Express.js 5, Zod, BullMQ, Pino |
| 資料庫 | PostgreSQL (Supabase), Drizzle ORM |
| 金流 | PChomePay, LINE Pay, JKOPay |
| 物流 | ECPay 綠界 (7-11、全家、黑貓) |
| 電子發票 | Amego API |
| Email | Resend + React Email |
| Monorepo | Turborepo + npm workspaces |

## 3. 資料夾結構

```
realreal/
├── apps/
│   ├── web/          # Next.js 前端 (部署至 Vercel)
│   │   └── src/
│   │       ├── app/          # App Router 頁面
│   │       ├── components/   # UI 元件
│   │       └── lib/          # 工具函式
│   └── api/          # Express API (部署至 Railway)
│       ├── src/
│       │   ├── routes/       # REST 路由
│       │   ├── middleware/   # Auth, Admin, Editor
│       │   ├── workers/      # BullMQ 背景任務
│       │   ├── jobs/         # 排程任務
│       │   ├── emails/       # Email 模板
│       │   └── lib/          # 共用工具
│       └── scripts/          # 遷移腳本
├── packages/
│   └── db/           # Drizzle ORM schema + 遷移檔
│       ├── src/schema/       # TypeScript schema 定義
│       └── migrations/       # SQL 遷移檔 (0001-0011)
├── docs/             # 文件
└── supabase/         # Supabase CLI 設定
```

## 4. 開發環境設定

```bash
# 1. 安裝依賴
npm install

# 2. 複製環境變數
cp .env.example .env
# 填入 Supabase URL/Key, Redis URL, 金流金鑰等

# 3. 執行遷移
cd packages/db && npx drizzle-kit push

# 4. Seed 管理員帳號
cd apps/api && npx tsx scripts/seed-admin.ts

# 5. 啟動開發
npm run dev  # 同時啟動 web + api
```

### 關鍵環境變數

| 變數 | 用途 |
|------|------|
| `SUPABASE_URL` | Supabase 專案 URL |
| `SUPABASE_ANON_KEY` | 前端用 anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 後端用 service role key |
| `RAILWAY_API_URL` | API 位址 |
| `INTERNAL_API_SECRET` | 前後端互信金鑰 |
| `REDIS_URL` | Upstash Redis 連線 |
| `RESEND_API_KEY` | Resend Email API |
| `TOKEN_ENCRYPTION_KEY` | PChomePay Token 加密金鑰 |

## 5. 資料庫遷移

| 檔案 | 說明 |
|------|------|
| `0001_initial.sql` | 核心 schema：users, products, orders, payments, subscriptions, invoices, coupons |
| `0002_catalog_search.sql` | 商品全文搜尋索引 |
| `0003_invoice_extensions.sql` | 電子發票擴充欄位 (carrier, love_code 等) |
| `0004_subscription_plans_seed.sql` | 3 個訂閱方案 seed |
| `0005_cms_tables.sql` | CMS 表：posts, media, site_contents |
| `0006_campaigns_tier_marketing.sql` | 行銷活動表 + 等級行銷 |
| `0007_wp_membership_data.sql` | WP 會員等級同步 (初心/知心/同心之友) |
| `0008_product_reviews.sql` | 商品評價表 |
| `0009_seed_products.sql` | 23 個商品 + 38 個變體 seed |
| `0011_campaign_promo_types.sql` | 擴充行銷規則類型 + 12 個預設模板 |

## 6. API 路由清單

### 公開路由
| 路由 | 方法 | 說明 |
|------|------|------|
| `/health` | GET | 健康檢查 |
| `/categories` | GET | 商品分類 |
| `/products` | GET | 商品列表 (分頁、篩選、搜尋) |
| `/products/:slug` | GET | 商品詳情 |
| `/products/:id/variants` | GET | 商品變體 |
| `/products/:productId/reviews` | GET | 商品評價 |
| `/subscription-plans` | GET | 訂閱方案 |
| `/posts` | GET | 部落格文章 |
| `/posts/:slug` | GET | 文章詳情 |
| `/post-categories` | GET | 文章分類 |
| `/post-tags` | GET | 文章標籤 |
| `/site-contents/:key` | GET | 網站內容 |
| `/membership-tiers` | GET | 會員等級 |
| `/campaigns/active` | GET | 進行中活動 |
| `/orders` | POST | 建立訂單 |
| `/coupons/validate` | POST | 驗證優惠券 |

### 需認證路由
| 路由 | 方法 | 說明 |
|------|------|------|
| `/orders` | GET | 我的訂單 |
| `/orders/:id` | GET | 訂單詳情 |
| `/subscriptions` | GET/POST | 訂閱管理 |
| `/subscriptions/:id` | PATCH | 暫停/恢復/取消訂閱 |
| `/me` | GET | 我的資料 |
| `/products/:productId/reviews` | POST | 提交評價 |

### 管理路由 (requireAuth + requireAdmin/Editor)
- `/admin/campaigns` — CRUD 行銷活動
- `/admin/invoices` — 發票管理
- `/admin/posts` — 文章 CRUD
- `/admin/media` — 媒體庫
- `/admin/reviews` — 評價審核
- `/admin/site-contents/:key` — 網站內容編輯
- `/admin/users` — 使用者管理
- `/admin/membership-tiers` — 等級 CRUD
- `/admin/orders/:id/status` — 訂單狀態更新

### Webhook 路由
- `/webhooks/pchomepay` — PChomePay 付款回調
- `/webhooks/linepay` — LINE Pay 付款回調
- `/webhooks/jkopay` — JKOPay 付款回調
- `/webhooks/ecpay-logistics` — ECPay 物流狀態
- `/webhooks/pchomepay-token` — PChomePay Token 扣款
- `/webhooks/amego` — 電子發票通知

## 7. 前端頁面清單

### 公開頁面
| 路由 | 說明 |
|------|------|
| `/` | 首頁 (Hero + 商品 + 部落格 + 見證) |
| `/shop` | 商品列表 |
| `/shop/[slug]` | 商品詳情 |
| `/blog` | 部落格 |
| `/blog/[slug]` | 文章內頁 |
| `/search` | 搜尋 |
| `/subscribe` | 訂閱方案 |
| `/subscribe/[planId]` | 訂閱詳情 |
| `/about` | 關於我們 |
| `/faq` | 常見問題 |
| `/contact` | 聯絡我們 |
| `/privacy` | 隱私權政策 |
| `/terms` | 服務條款 |
| `/shipping` | 配送說明 |
| `/returns` | 退換貨政策 |

### 認證頁面
`/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`

### 會員頁面
`/my-account`, `/my-account/orders`, `/my-account/subscriptions`, `/my-account/addresses`, `/my-account/profile`, `/my-account/membership`

### 結帳流程
`/checkout`, `/checkout/confirm`, `/checkout/payment`

### 管理後台 (19 模組)
`/admin` (Dashboard), `/admin/analytics`, `/admin/orders`, `/admin/products`, `/admin/customers`, `/admin/subscriptions`, `/admin/invoices`, `/admin/posts`, `/admin/media`, `/admin/pages`, `/admin/homepage`, `/admin/coupons`, `/admin/campaigns`, `/admin/reviews`, `/admin/membership`, `/admin/users`, `/admin/settings`, `/admin/jobs`

## 8. 資料遷移狀態

| 資料類別 | 舊站數量 | 狀態 | 說明 |
|----------|----------|------|------|
| 會員等級 | 3 個 | ✅ 已遷移 | migration 0007 |
| 訂閱方案 | 3 個 | ✅ 已 seed | migration 0004 |
| 商品分類 | 4 個 | ✅ 已匯入 | commit 420294e |
| 歷史訂單 | 73 筆 | ✅ 已匯入 | commit 420294e |
| 訂單明細 | 176 筆 | ✅ 已匯入 | commit 420294e |
| 訂單地址 | 146 筆 | ✅ 已匯入 | commit 420294e |
| 部落格文章 | 5 篇 | ✅ 已匯入 | commit 420294e |
| 行銷活動 | 7 個 | ✅ 已匯入 | commit 420294e |
| 商品資料 | 23 個 | ✅ 已 seed | migration 0009 (含38變體) |
| **用戶帳號** | 51 個 | ❌ 待遷移 | 腳本就緒: `migrate-users.ts` |
| **優惠券** | — | ❌ 待遷移 | 腳本就緒: `migrate-coupons.ts` |
| **商品評價** | — | ❌ 待遷移 | 腳本就緒: `migrate-reviews.ts` |
| **媒體圖片** | — | ❌ 待遷移 | 腳本就緒: `migrate-media.ts` |
| **更多文章** | — | ❌ 待遷移 | 腳本就緒: `migrate-blog-posts.ts` |

## 9. 遷移腳本使用說明

所有腳本位於 `apps/api/scripts/`，模板位於 `apps/api/scripts/templates/`。

```bash
cd apps/api

# 用戶遷移 (產生密碼重設 CSV)
npx tsx scripts/migrate-users.ts [--dry-run] [--input ./wordpress/users.json]

# 優惠券遷移
npx tsx scripts/migrate-coupons.ts [--include-expired] [path-to-json]

# 評價遷移
npx tsx scripts/migrate-reviews.ts [path-to-json]

# 媒體遷移 (上傳圖片到 Supabase Storage)
npx tsx scripts/migrate-media.ts [--dry-run] [--dir ./wordpress/uploads/]

# 文章遷移 (含 WP shortcode 清除)
npx tsx scripts/migrate-blog-posts.ts [--dry-run] [--url-map=./wordpress/url-map.json]
```

每個腳本的 JSON 格式參見 `scripts/templates/` 目錄。

## 10. 行銷活動系統

### 10 種規則類型

| 類型 | 說明 | 設定欄位 |
|------|------|----------|
| `discount` | 全館/指定分類折扣 | 折扣方式、折扣值、適用範圍 |
| `buy_x_get_y` | 買X送Y | 購買數量、贈送數量、限同品項、贈品規則 |
| `second_half_price` | 第二件優惠 | 折扣%、適用範圍、最多幾組 |
| `spend_threshold` | 滿額折扣 | 最低消費、折扣金額、可否疊加 |
| `combo_discount` | 任選N件折扣 | 最少件數、折扣%、適用範圍 |
| `freebie` | 滿額贈品 | 最低金額、贈品名稱/SKU/數量 |
| `free_shipping` | 免運 | 最低訂單金額 |
| `points_multiplier` | 點數加倍 | 倍率、適用範圍 |
| `bundle` | 組合優惠 | 購買/贈送數量 |
| `tier_upgrade_bonus` | 升等加碼 | 自訂 JSON |

### 12 個預設模板
管理員可在 `/admin/campaigns` 一鍵匯入：買一送一、買三送二、第二件半價、第二件6折、滿千折百、滿2000折300、全館95折、任選3件88折、任選5件8折、免運$800、點數雙倍、滿額贈品。

## 11. 自動化測試

### API 測試 (120 個)
| 檔案 | 測試數 | 涵蓋 |
|------|--------|------|
| `campaigns.test.ts` | 28 | CRUD + 10 種活動類型 + auth guards |
| `posts.test.ts` | 14 | 文章 CRUD + 標籤 + auth |
| `reviews.test.ts` | 13 | 評價 CRUD + 審核 |
| `site-contents.test.ts` | 8 | 內容讀寫 + validation |
| `users.test.ts` | 7 | 使用者管理 + 角色 |
| `media.test.ts` | 14 | 上傳/刪除 + Storage 錯誤 |
| 原有測試 | 36 | products, orders, categories, etc. |

### 前端測試 (64 個)
| 檔案 | 測試數 | 涵蓋 |
|------|--------|------|
| `cart.test.ts` | 14 | Zustand store CRUD + total 計算 |
| `catalog.test.ts` | 9 | API helpers + error handling |
| `content.test.ts` | 11 | site content + posts fetching |
| `campaigns.test.ts` | 14 | 活動頁面邏輯 + 模板 + 狀態篩選 |
| 原有測試 | 16 | admin layout auth |

## 12. 部署

| 服務 | 平台 | 設定檔 |
|------|------|--------|
| Frontend | Vercel | `.vercelignore` |
| Backend | Railway | `apps/api/railway.toml` |
| Database | Supabase | `supabase/.temp/` |
| Redis | Upstash | env: `REDIS_URL` |

## 13. 待完成事項

### 優先處理
1. 修復 `payment_transactions` vs `payments` 表名不符問題
2. 新增付款啟動端點 (POST /orders/:orderId/pay)
3. 修復 Worker job 名稱錯誤 (order-paid-email/invoice 不會被處理)
4. 訂單建立加入伺服器端價格驗證
5. 媒體端點加入認證中間件
6. 修復前端/API shipping method enum 不符
7. 串接 SubscriptionBilled/Failed email 模板
8. 修復環境變數命名不一致 (TOKEN_ENCRYPTION_KEY)
9. 執行用戶遷移 + 批次密碼重設信
10. 商品圖片遷移到 Supabase Storage

### 未來規劃
- LINE OAuth 登入
- Cloudflare R2 儲存
- 部分退款 & 折讓單
- LINE 官方帳號通知
- Headless CMS (Sanity)
