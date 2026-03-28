/**
 * import-products.ts
 *
 * 從 scrape-products.ts 產出的 JSON 匯入商品到新站資料庫
 * 同時下載所有商品圖片到 Supabase Storage
 *
 * 使用方式：
 *   npx tsx scripts/import-products.ts ./scraped-products.json
 *   npx tsx scripts/import-products.ts ./scraped-products.json --dry-run
 *   npx tsx scripts/import-products.ts ./scraped-products.json --skip-images
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

const DRY_RUN = process.argv.includes("--dry-run")
const SKIP_IMAGES = process.argv.includes("--skip-images")

const INPUT_PATH = process.argv.find(a => a.endsWith(".json") && !a.startsWith("--")) ?? "./scraped-products.json"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ 請設定 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 環境變數")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

/* ------------------------------------------------------------------ */
/*  Types (matching scrape output)                                     */
/* ------------------------------------------------------------------ */

interface ScrapedProduct {
  wp_id: number | null
  name: string
  slug: string
  permalink: string
  description: string
  short_description: string
  price: string
  regular_price: string
  sale_price: string
  sku: string
  stock_quantity: number | null
  stock_status: string
  categories: { name: string; slug: string }[]
  images: { src: string; alt: string; position: number }[]
  variations: ScrapedVariation[]
  weight: string
}

interface ScrapedVariation {
  wp_id: number | null
  sku: string
  price: string
  regular_price: string
  sale_price: string
  stock_quantity: number | null
  stock_status: string
  attributes: { name: string; option: string }[]
  weight: string
  image: { src: string; alt: string } | null
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

async function downloadAndUploadImage(
  imageUrl: string,
  filename: string
): Promise<string | null> {
  if (SKIP_IMAGES || DRY_RUN) return imageUrl

  try {
    const res = await fetch(imageUrl)
    if (!res.ok) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    const ext = path.extname(new URL(imageUrl).pathname) || ".jpg"
    const storagePath = `products/${Date.now()}-${filename}${ext}`

    const { error } = await supabase.storage
      .from("media")
      .upload(storagePath, buffer, {
        contentType: res.headers.get("content-type") ?? "image/jpeg",
      })

    if (error) {
      console.warn(`    ⚠️ 圖片上傳失敗: ${error.message}`)
      return imageUrl // 回傳原始 URL 作為 fallback
    }

    const { data: publicUrl } = supabase.storage.from("media").getPublicUrl(storagePath)
    return publicUrl.publicUrl
  } catch (err) {
    console.warn(`    ⚠️ 圖片下載失敗: ${err}`)
    return imageUrl
  }
}

async function findOrCreateCategory(
  name: string,
  slug: string,
  categoryCache: Map<string, string>
): Promise<string> {
  if (categoryCache.has(slug)) return categoryCache.get(slug)!

  // 查找現有分類
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .single()

  if (existing) {
    categoryCache.set(slug, existing.id)
    return existing.id
  }

  if (DRY_RUN) {
    categoryCache.set(slug, `dry-run-${slug}`)
    return `dry-run-${slug}`
  }

  // 建立新分類
  const { data: created, error } = await supabase
    .from("categories")
    .insert({ name, slug })
    .select("id")
    .single()

  if (error || !created) {
    console.warn(`    ⚠️ 分類建立失敗: ${name} — ${error?.message}`)
    return ""
  }

  categoryCache.set(slug, created.id)
  return created.id
}

/* ------------------------------------------------------------------ */
/*  Main Import                                                        */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║  RealReal 商品匯入工具                    ║")
  console.log("╚══════════════════════════════════════════╝")
  if (DRY_RUN) console.log("🏃 DRY RUN 模式 — 不會寫入任何資料")
  console.log()

  // 讀取 JSON
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`❌ 找不到檔案: ${INPUT_PATH}`)
    console.error("   請先執行: npx tsx scripts/scrape-products.ts")
    process.exit(1)
  }

  const products: ScrapedProduct[] = JSON.parse(fs.readFileSync(INPUT_PATH, "utf-8"))
  console.log(`📦 讀取 ${products.length} 個商品`)
  console.log()

  const categoryCache = new Map<string, string>()
  let imported = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    console.log(`[${i + 1}/${products.length}] ${p.name}`)

    // 檢查是否已存在
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("slug", p.slug)
      .single()

    if (existing) {
      // 更新現有商品的描述和圖片（不要跳過！）
      console.log(`  🔄 已存在，更新描述和圖片...`)

      if (!DRY_RUN) {
        // 處理圖片
        const images = []
        for (let j = 0; j < p.images.length; j++) {
          const img = p.images[j]
          const newUrl = await downloadAndUploadImage(img.src, `${p.slug}-${j}`)
          if (newUrl) {
            images.push({ url: newUrl, alt: img.alt || p.name, sort_order: j })
          }
        }

        const { error: updateErr } = await supabase
          .from("products")
          .update({
            description: p.description || p.short_description || undefined,
            images: images.length > 0 ? images : undefined,
          })
          .eq("id", existing.id)

        if (updateErr) {
          console.warn(`  ⚠️ 更新失敗: ${updateErr.message}`)
          failed++
        } else {
          console.log(`  ✅ 已更新 (${images.length} 張圖片)`)
          imported++
        }
      } else {
        console.log(`  [DRY] 會更新描述 (${p.description.length} chars) + ${p.images.length} 張圖片`)
        imported++
      }
      continue
    }

    // 新商品: 解析分類
    let categoryId: string | undefined
    if (p.categories.length > 0) {
      const cat = p.categories[0]
      categoryId = await findOrCreateCategory(cat.name, cat.slug || slugify(cat.name), categoryCache) || undefined
    }

    // 處理圖片
    const images = []
    for (let j = 0; j < p.images.length; j++) {
      const img = p.images[j]
      const newUrl = await downloadAndUploadImage(img.src, `${p.slug}-${j}`)
      if (newUrl) {
        images.push({ url: newUrl, alt: img.alt || p.name, sort_order: j })
      }
    }

    if (DRY_RUN) {
      console.log(`  [DRY] 會建立商品: ${p.name}`)
      console.log(`        描述: ${p.description.substring(0, 80)}...`)
      console.log(`        分類: ${p.categories[0]?.name ?? "無"}`)
      console.log(`        圖片: ${p.images.length} 張`)
      console.log(`        變體: ${p.variations.length} 個`)
      imported++
      continue
    }

    // 插入商品
    const { data: created, error: createErr } = await supabase
      .from("products")
      .insert({
        name: p.name,
        slug: p.slug,
        description: p.description || p.short_description || null,
        category_id: categoryId,
        images: images.length > 0 ? images : null,
        is_active: true,
      })
      .select("id")
      .single()

    if (createErr || !created) {
      console.warn(`  ❌ 建立失敗: ${createErr?.message}`)
      failed++
      continue
    }

    // 插入變體
    if (p.variations.length > 0) {
      for (const v of p.variations) {
        const varName = v.attributes.map(a => a.option).join(" / ") || p.name
        const { error: varErr } = await supabase
          .from("product_variants")
          .insert({
            product_id: created.id,
            sku: v.sku || null,
            name: varName,
            price: Number(v.regular_price || v.price) || 0,
            sale_price: v.sale_price ? Number(v.sale_price) : null,
            stock_qty: v.stock_quantity ?? 100,
            weight: v.weight ? Number(v.weight) : null,
            attributes: v.attributes.reduce((acc, a) => ({ ...acc, [a.name]: a.option }), {}),
          })

        if (varErr) console.warn(`    ⚠️ 變體失敗: ${varErr.message}`)
      }
    } else {
      // 簡單商品 — 建一個預設變體
      const { error: varErr } = await supabase
        .from("product_variants")
        .insert({
          product_id: created.id,
          sku: p.sku || null,
          name: "預設",
          price: Number(p.regular_price || p.price) || 0,
          sale_price: p.sale_price ? Number(p.sale_price) : null,
          stock_qty: p.stock_quantity ?? 100,
          weight: p.weight ? Number(p.weight) : null,
        })

      if (varErr) console.warn(`    ⚠️ 預設變體失敗: ${varErr.message}`)
    }

    console.log(`  ✅ 已建立 (${p.variations.length} 變體, ${images.length} 圖片)`)
    imported++
  }

  console.log()
  console.log("═══════════════════════════════════")
  console.log(`✅ 匯入: ${imported}`)
  console.log(`⏩ 跳過: ${skipped}`)
  console.log(`❌ 失敗: ${failed}`)
  console.log("═══════════════════════════════════")

  if (DRY_RUN) {
    console.log("\n🏃 這是 DRY RUN — 移除 --dry-run 後再次執行以實際匯入")
  }
}

main().catch(err => {
  console.error("❌ 執行失敗:", err)
  process.exit(1)
})
