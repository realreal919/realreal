/**
 * scrape-products.ts
 *
 * 從 realreal.cc WordPress/WooCommerce 網站爬取所有商品完整資料
 *
 * 使用方式（在可存取 realreal.cc 的環境執行）：
 *   npx tsx scripts/scrape-products.ts
 *   npx tsx scripts/scrape-products.ts --api          # 使用 WC REST API（需 API key）
 *   npx tsx scripts/scrape-products.ts --output ./data/products.json
 *
 * 輸出：完整商品 JSON（含描述、圖片、變體、價格等），
 *       可直接餵給 import-products.ts 匯入新站
 */

const BASE_URL = process.env.WP_SITE_URL ?? "https://realreal.cc"
const WC_KEY = process.env.WC_CONSUMER_KEY ?? ""
const WC_SECRET = process.env.WC_CONSUMER_SECRET ?? ""
const OUTPUT_PATH = process.argv.includes("--output")
  ? process.argv[process.argv.indexOf("--output") + 1]
  : "./scraped-products.json"
const USE_API = process.argv.includes("--api")

import * as fs from "fs"
import * as path from "path"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScrapedProduct {
  wp_id: number | null
  name: string
  slug: string
  permalink: string
  description: string         // 完整 HTML 描述
  short_description: string   // 短描述
  price: string
  regular_price: string
  sale_price: string
  sku: string
  stock_quantity: number | null
  stock_status: string
  categories: { name: string; slug: string }[]
  tags: { name: string; slug: string }[]
  images: { src: string; alt: string; position: number }[]
  attributes: { name: string; options: string[] }[]
  variations: ScrapedVariation[]
  meta_data: Record<string, unknown>
  weight: string
  dimensions: { length: string; width: string; height: string }
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
/*  Method 1: WooCommerce REST API (推薦，需 API Key)                   */
/* ------------------------------------------------------------------ */

async function scrapeViaAPI(): Promise<ScrapedProduct[]> {
  if (!WC_KEY || !WC_SECRET) {
    console.error("❌ 需要設定 WC_CONSUMER_KEY 和 WC_CONSUMER_SECRET 環境變數")
    console.error("   在 WordPress 後台 → WooCommerce → 設定 → 進階 → REST API 建立")
    process.exit(1)
  }

  const products: ScrapedProduct[] = []
  let page = 1
  const perPage = 100

  console.log(`🔍 正在透過 WooCommerce REST API 抓取商品...`)

  while (true) {
    const url = `${BASE_URL}/wp-json/wc/v3/products?page=${page}&per_page=${perPage}&consumer_key=${WC_KEY}&consumer_secret=${WC_SECRET}`
    console.log(`  📄 第 ${page} 頁...`)

    const res = await fetch(url)
    if (!res.ok) {
      console.error(`❌ API 回應 ${res.status}: ${await res.text()}`)
      break
    }

    const data: any[] = await res.json()
    if (data.length === 0) break

    for (const p of data) {
      // 抓取變體
      let variations: ScrapedVariation[] = []
      if (p.type === "variable" && p.variations?.length > 0) {
        const varUrl = `${BASE_URL}/wp-json/wc/v3/products/${p.id}/variations?per_page=100&consumer_key=${WC_KEY}&consumer_secret=${WC_SECRET}`
        const varRes = await fetch(varUrl)
        if (varRes.ok) {
          const varData: any[] = await varRes.json()
          variations = varData.map((v: any) => ({
            wp_id: v.id,
            sku: v.sku ?? "",
            price: v.price ?? "",
            regular_price: v.regular_price ?? "",
            sale_price: v.sale_price ?? "",
            stock_quantity: v.stock_quantity,
            stock_status: v.stock_status ?? "instock",
            attributes: (v.attributes ?? []).map((a: any) => ({
              name: a.name,
              option: a.option,
            })),
            weight: v.weight ?? "",
            image: v.image ? { src: v.image.src, alt: v.image.alt ?? "" } : null,
          }))
        }
      }

      products.push({
        wp_id: p.id,
        name: p.name,
        slug: p.slug,
        permalink: p.permalink ?? "",
        description: p.description ?? "",
        short_description: p.short_description ?? "",
        price: p.price ?? "",
        regular_price: p.regular_price ?? "",
        sale_price: p.sale_price ?? "",
        sku: p.sku ?? "",
        stock_quantity: p.stock_quantity,
        stock_status: p.stock_status ?? "instock",
        categories: (p.categories ?? []).map((c: any) => ({
          name: c.name,
          slug: c.slug,
        })),
        tags: (p.tags ?? []).map((t: any) => ({ name: t.name, slug: t.slug })),
        images: (p.images ?? []).map((img: any, idx: number) => ({
          src: img.src,
          alt: img.alt ?? "",
          position: idx,
        })),
        attributes: (p.attributes ?? []).map((a: any) => ({
          name: a.name,
          options: a.options ?? [],
        })),
        variations,
        meta_data: {},
        weight: p.weight ?? "",
        dimensions: p.dimensions ?? { length: "", width: "", height: "" },
      })
    }

    page++
  }

  return products
}

/* ------------------------------------------------------------------ */
/*  Method 2: HTML Scraping (不需 API Key)                              */
/* ------------------------------------------------------------------ */

async function scrapeViaHTML(): Promise<ScrapedProduct[]> {
  console.log(`🔍 正在透過 HTML 頁面爬取商品...`)
  console.log(`   目標: ${BASE_URL}`)

  const products: ScrapedProduct[] = []

  // Step 1: 取得商品列表頁
  const shopUrls: string[] = []
  let page = 1

  while (true) {
    const url = page === 1
      ? `${BASE_URL}/shop/`
      : `${BASE_URL}/shop/page/${page}/`

    console.log(`  📄 列表頁 ${page}...`)

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-TW,zh;q=0.9",
        },
      })

      if (!res.ok) {
        if (page === 1) {
          console.error(`❌ 無法存取商店頁面 (${res.status})`)
          console.error("   建議改用 --api 模式或提供 WordPress XML 匯出檔")
          process.exit(1)
        }
        break // 已到最後一頁
      }

      const html = await res.text()

      // 提取商品連結 (WooCommerce 標準 class)
      const linkRegex = /<a[^>]*href="([^"]*)"[^>]*class="[^"]*woocommerce-LoopProduct-link/g
      let match
      while ((match = linkRegex.exec(html)) !== null) {
        if (!shopUrls.includes(match[1])) shopUrls.push(match[1])
      }

      // 備用: 從 product class 提取
      const altRegex = /class="[^"]*post-\d+[^"]*product[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"/g
      while ((match = altRegex.exec(html)) !== null) {
        if (!shopUrls.includes(match[1])) shopUrls.push(match[1])
      }

      // 檢查是否有下一頁
      if (!html.includes(`/shop/page/${page + 1}/`)) break
      page++
    } catch (err) {
      if (page === 1) throw err
      break
    }
  }

  console.log(`  ✓ 找到 ${shopUrls.length} 個商品連結`)

  // Step 2: 逐一爬取每個商品頁
  for (let i = 0; i < shopUrls.length; i++) {
    const productUrl = shopUrls[i]
    console.log(`  🏷️  [${i + 1}/${shopUrls.length}] ${productUrl}`)

    try {
      const res = await fetch(productUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "zh-TW,zh;q=0.9",
        },
      })

      if (!res.ok) {
        console.warn(`    ⚠️ 跳過 (${res.status})`)
        continue
      }

      const html = await res.text()
      const product = parseProductHTML(html, productUrl)
      if (product) products.push(product)

      // 禮貌性等待
      await new Promise(r => setTimeout(r, 500))
    } catch (err) {
      console.warn(`    ⚠️ 錯誤: ${err}`)
    }
  }

  return products
}

function parseProductHTML(html: string, url: string): ScrapedProduct | null {
  // 商品名稱
  const nameMatch = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
  const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, "").trim() : ""
  if (!name) return null

  // Slug (from URL)
  const slugMatch = url.match(/\/product\/([^/]+)\/?$/)
  const slug = slugMatch ? slugMatch[1] : name.toLowerCase().replace(/\s+/g, "-")

  // 描述 (完整)
  const descMatch = html.match(/<div[^>]*class="[^"]*woocommerce-product-details__short-description[^"]*"[^>]*>([\s\S]*?)<\/div>/)
  const shortDescription = descMatch ? descMatch[1].trim() : ""

  const fullDescMatch = html.match(/<div[^>]*id="tab-description"[^>]*>([\s\S]*?)<\/div>/)
  const description = fullDescMatch ? fullDescMatch[1].trim() : shortDescription

  // 價格
  const priceMatch = html.match(/<p[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/p>/)
  const priceHtml = priceMatch ? priceMatch[1] : ""
  const regularMatch = priceHtml.match(/<del[^>]*>[\s\S]*?(\d[\d,]*)</)
  const saleMatch = priceHtml.match(/<ins[^>]*>[\s\S]*?(\d[\d,]*)</)
  const singleMatch = priceHtml.match(/(\d[\d,]+)/)

  const regularPrice = regularMatch ? regularMatch[1].replace(/,/g, "") : (singleMatch ? singleMatch[1].replace(/,/g, "") : "")
  const salePrice = saleMatch ? saleMatch[1].replace(/,/g, "") : ""
  const price = salePrice || regularPrice

  // SKU
  const skuMatch = html.match(/<span[^>]*class="sku"[^>]*>([\s\S]*?)<\/span>/)
  const sku = skuMatch ? skuMatch[1].trim() : ""

  // 圖片
  const images: { src: string; alt: string; position: number }[] = []
  const imgRegex = /<div[^>]*class="[^"]*woocommerce-product-gallery__image[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*(?:alt="([^"]*)")?/g
  let imgMatch
  let pos = 0
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    images.push({ src: imgMatch[1], alt: imgMatch[2] ?? "", position: pos++ })
  }

  // 備用: 從 og:image 取得
  if (images.length === 0) {
    const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/)
    if (ogMatch) images.push({ src: ogMatch[1], alt: name, position: 0 })
  }

  // 分類
  const categories: { name: string; slug: string }[] = []
  const catRegex = /<a[^>]*href="[^"]*product-cat(?:egory)?\/([^/"]*)[^"]*"[^>]*rel="tag"[^>]*>([^<]*)<\/a>/g
  let catMatch
  while ((catMatch = catRegex.exec(html)) !== null) {
    categories.push({ name: catMatch[2].trim(), slug: catMatch[1] })
  }

  // 變體 (from variation JSON embedded in page)
  const variations: ScrapedVariation[] = []
  const varJsonMatch = html.match(/var\s+product_variations\s*=\s*(\[[\s\S]*?\]);/)
    || html.match(/"product_variations"\s*:\s*(\[[\s\S]*?\])/)
  if (varJsonMatch) {
    try {
      const varData = JSON.parse(varJsonMatch[1])
      for (const v of varData) {
        variations.push({
          wp_id: v.variation_id ?? null,
          sku: v.sku ?? "",
          price: String(v.display_price ?? ""),
          regular_price: String(v.display_regular_price ?? ""),
          sale_price: v.display_price !== v.display_regular_price ? String(v.display_price ?? "") : "",
          stock_quantity: v.max_qty === "" ? null : Number(v.max_qty) || null,
          stock_status: v.is_in_stock ? "instock" : "outofstock",
          attributes: Object.entries(v.attributes ?? {}).map(([key, val]) => ({
            name: key.replace("attribute_", "").replace("pa_", ""),
            option: String(val),
          })),
          weight: v.weight ?? "",
          image: v.image ? { src: v.image.full_src ?? v.image.src ?? "", alt: v.image.alt ?? "" } : null,
        })
      }
    } catch { /* ignore parse errors */ }
  }

  // 重量
  const weightMatch = html.match(/class="[^"]*product_weight[^"]*"[^>]*>([\d.]+)/)
  const weight = weightMatch ? weightMatch[1] : ""

  return {
    wp_id: null,
    name,
    slug,
    permalink: url,
    description,
    short_description: shortDescription,
    price,
    regular_price: regularPrice,
    sale_price: salePrice,
    sku,
    stock_quantity: null,
    stock_status: "instock",
    categories,
    tags: [],
    images,
    attributes: [],
    variations,
    meta_data: {},
    weight,
    dimensions: { length: "", width: "", height: "" },
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║  RealReal 商品完整爬取工具               ║")
  console.log("╚══════════════════════════════════════════╝")
  console.log()

  let products: ScrapedProduct[]

  if (USE_API) {
    products = await scrapeViaAPI()
  } else {
    products = await scrapeViaHTML()
  }

  console.log()
  console.log(`✅ 共爬取 ${products.length} 個商品`)

  // 統計
  const totalImages = products.reduce((s, p) => s + p.images.length, 0)
  const totalVariations = products.reduce((s, p) => s + p.variations.length, 0)
  const withDesc = products.filter(p => p.description.length > 0).length

  console.log(`   📷 ${totalImages} 張圖片`)
  console.log(`   🔄 ${totalVariations} 個變體`)
  console.log(`   📝 ${withDesc} 個有描述`)
  console.log()

  // 輸出
  const outputDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(products, null, 2), "utf-8")
  console.log(`💾 已儲存至: ${OUTPUT_PATH}`)
  console.log()
  console.log(`下一步：執行匯入`)
  console.log(`  npx tsx scripts/import-products.ts ${OUTPUT_PATH}`)
}

main().catch(err => {
  console.error("❌ 執行失敗:", err)
  process.exit(1)
})
