-- 出貨扣庫存的防重複紀錄
--
-- 庫存改成「產生出貨單時扣展開後的單品」（deduct_stock.py）。組合商品在結帳當下
-- 往往還不知道實際口味 —— 客人選「其他口味（於結帳頁備註）」，真正的組合寫在備註
-- 裡，要人讀過才算得出來，而那正是產出貨單那一刻做的事。
--
-- 這張表存在的唯一理由是**防止重複扣**。出貨單常常會重印、補印、或把同一批訂單
-- 重跑一次（今天就重跑了三次），沒有這道防線，跑第二次庫存就被扣成兩倍，而且事後
-- 很難查出來是哪裡多扣的。
--
-- order_number 設為主鍵：一張訂單只扣一次，重跑會直接被跳過。
create table if not exists public.stock_ledger (
  order_number text primary key,
  -- 當時扣了哪些品項各幾件；日後對帳或要回沖時，這是唯一的依據
  detail       jsonb not null,
  deducted_at  timestamptz not null default now()
);

-- 批發價與庫存異動都不對外，只有後端 service-role 進得來。
alter table public.stock_ledger enable row level security;
