/**
 * parse-wp-export.ts
 *
 * 解析 WordPress XML 匯出檔（WXR），提取所有商品資料
 * 輸出與 scrape-products.ts 相同格式的 JSON，可餵給 import-products.ts
 *
 * 使用方式：
 *   npx tsx scripts/parse-wp-export.ts ./wordpress-export.xml
 *   npx tsx scripts/parse-wp-export.ts ./wordpress-export.xml --output ./data/products.json
 *
 * WordPress 匯出方式：
 *   後台 → 工具 → 匯出 → 選擇「商品」→ 下載匯出檔案
 */

import * as fs from "fs"
import * as path from "path"

const INPUT_PATH = process.argv.find(a => (a.endsWith(".xml") || a.endsWith(".XML")) && !a.startsWith("--"))
const OUTPUT_PATH = process.argv.includes("--output")
  ? process.argv[process.argv.indexOf("--output") + 1]
  : "./scraped-products.json"

if (!INPUT_PATH) {
  console.error("❌ 請提供 WordPress XML 匯出檔路徑")
  console.error("   用法: npx tsx scripts/parse-wp-export.ts ./wordpress-export.xml")
  console.error()
  console.error("   WordPress 匯出方式:")
  console.error("   後台 → 工具 → 匯出 → 選擇「商品」→ 下載匯出檔案")
  process.exit(1)
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
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
/*  XML Parsing (simple, no dependencies)                              */
/* ------------------------------------------------------------------ */

function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`)
  const cdataMatch = xml.match(cdataRegex)
  if (cdataMatch) return cdataMatch[1]

  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  const match = xml.match(regex)
  return match ? match[1].trim() : ""
}

function extractAllTags(xml: string, tag: string): string[] {
  const results: string[] = []
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g")
  let match
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim())
  }
  return results
}

function extractMeta(itemXml: string, key: string): string {
  // wp:postmeta blocks contain wp:meta_key and wp:meta_value
  const metaBlocks = itemXml.split("<wp:postmeta>").slice(1)
  for (const block of metaBlocks) {
    const metaKey = extractTag(block, "wp:meta_key")
    if (metaKey === key) {
      return extractTag(block, "wp:meta_value")
    }
  }
  return ""
}

function extractAllMeta(itemXml: string): Record<string, string> {
  const result: Record<string, string> = {}
  const metaBlocks = itemXml.split("<wp:postmeta>").slice(1)
  for (const block of metaBlocks) {
    const key = extractTag(block, "wp:meta_key")
    const value = extractTag(block, "wp:meta_value")
    if (key) result[key] = value
  }
  return result
}

/* ------------------------------------------------------------------ */
/*  Main Parser                                                        */
/* ------------------------------------------------------------------ */

function parseWXR(xmlContent: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = []
  const variationMap = new Map<string, ScrapedVariation[]>()

  // Split into items
  const items = xmlContent.split("<item>").slice(1).map(chunk => {
    const endIdx = chunk.indexOf("</item>")
    return endIdx >= 0 ? chunk.substring(0, endIdx) : chunk
  })

  console.log(`  📄 找到 ${items.length} 個 items`)

  // First pass: collect variations
  for (const item of items) {
    const postType = extractTag(item, "wp:post_type")
    if (postType !== "product_variation") continue

    const parentId = extractTag(item, "wp:post_parent")
    const meta = extractAllMeta(item)

    const variation: ScrapedVariation = {
      wp_id: Number(extractTag(item, "wp:post_id")) || null,
      sku: meta._sku ?? "",
      price: meta._price ?? "",
      regular_price: meta._regular_price ?? "",
      sale_price: meta._sale_price ?? "",
      stock_quantity: meta._stock ? Number(meta._stock) : null,
      stock_status: meta._stock_status ?? "instock",
      attributes: [],
      weight: meta._weight ?? "",
      image: null,
    }

    // Extract variation attributes (attribute_pa_xxx keys)
    for (const [key, value] of Object.entries(meta)) {
      if (key.startsWith("attribute_")) {
        const attrName = key.replace("attribute_", "").replace("pa_", "")
        variation.attributes.push({ name: attrName, option: value })
      }
    }

    // Image
    const thumbId = meta._thumbnail_id
    if (thumbId) {
      // We'll resolve image URLs later
      variation.image = { src: `wp-attachment:${thumbId}`, alt: "" }
    }

    if (!variationMap.has(parentId)) variationMap.set(parentId, [])
    variationMap.get(parentId)!.push(variation)
  }

  // Collect attachment URLs
  const attachmentMap = new Map<string, string>()
  for (const item of items) {
    const postType = extractTag(item, "wp:post_type")
    if (postType !== "attachment") continue

    const id = extractTag(item, "wp:post_id")
    const url = extractTag(item, "wp:attachment_url")
    if (id && url) attachmentMap.set(id, url)
  }

  // Second pass: collect products
  for (const item of items) {
    const postType = extractTag(item, "wp:post_type")
    if (postType !== "product") continue

    const wpId = extractTag(item, "wp:post_id")
    const meta = extractAllMeta(item)

    // Categories
    const categories: { name: string; slug: string }[] = []
    const catRegex = /<category[^>]*domain="product_cat"[^>]*nicename="([^"]*)"[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g
    let catMatch
    while ((catMatch = catRegex.exec(item)) !== null) {
      categories.push({ name: catMatch[2], slug: catMatch[1] })
    }

    // Tags
    const tags: { name: string; slug: string }[] = []
    const tagRegex = /<category[^>]*domain="product_tag"[^>]*nicename="([^"]*)"[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g
    let tagMatch
    while ((tagMatch = tagRegex.exec(item)) !== null) {
      tags.push({ name: tagMatch[2], slug: tagMatch[1] })
    }

    // Images from gallery
    const images: { src: string; alt: string; position: number }[] = []
    const thumbId = meta._thumbnail_id
    if (thumbId && attachmentMap.has(thumbId)) {
      images.push({ src: attachmentMap.get(thumbId)!, alt: "", position: 0 })
    }

    // Gallery images
    const galleryIds = (meta._product_image_gallery ?? "").split(",").filter(Boolean)
    for (let i = 0; i < galleryIds.length; i++) {
      const url = attachmentMap.get(galleryIds[i].trim())
      if (url) images.push({ src: url, alt: "", position: images.length })
    }

    // Resolve variation images
    const variations = variationMap.get(wpId) ?? []
    for (const v of variations) {
      if (v.image?.src.startsWith("wp-attachment:")) {
        const attachId = v.image.src.replace("wp-attachment:", "")
        v.image = attachmentMap.has(attachId)
          ? { src: attachmentMap.get(attachId)!, alt: "" }
          : null
      }
    }

    // Product attributes
    const attributes: { name: string; options: string[] }[] = []
    // WooCommerce stores attributes in serialized PHP — we'll try to parse from meta
    const attrCount = Number(meta._product_attributes_count) || 0
    // Alternative: check for pa_xxx taxonomy terms
    const paRegex = /<category[^>]*domain="pa_([^"]*)"[^>]*nicename="([^"]*)"[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g
    const attrMap = new Map<string, string[]>()
    let paMatch
    while ((paMatch = paRegex.exec(item)) !== null) {
      const attrName = paMatch[1]
      const optionName = paMatch[3]
      if (!attrMap.has(attrName)) attrMap.set(attrName, [])
      attrMap.get(attrName)!.push(optionName)
    }
    for (const [name, options] of attrMap) {
      attributes.push({ name, options })
    }

    const product: ScrapedProduct = {
      wp_id: Number(wpId) || null,
      name: extractTag(item, "title"),
      slug: extractTag(item, "wp:post_name"),
      permalink: extractTag(item, "link"),
      description: extractTag(item, "content:encoded"),
      short_description: extractTag(item, "excerpt:encoded"),
      price: meta._price ?? "",
      regular_price: meta._regular_price ?? "",
      sale_price: meta._sale_price ?? "",
      sku: meta._sku ?? "",
      stock_quantity: meta._stock ? Number(meta._stock) : null,
      stock_status: meta._stock_status ?? "instock",
      categories,
      tags,
      images,
      attributes,
      variations,
      meta_data: meta,
      weight: meta._weight ?? "",
      dimensions: {
        length: meta._length ?? "",
        width: meta._width ?? "",
        height: meta._height ?? "",
      },
    }

    products.push(product)
  }

  return products
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║  WordPress XML 匯出檔解析工具            ║")
  console.log("╚══════════════════════════════════════════╝")
  console.log()

  if (!fs.existsSync(INPUT_PATH!)) {
    console.error(`❌ 找不到檔案: ${INPUT_PATH}`)
    process.exit(1)
  }

  console.log(`📂 讀取: ${INPUT_PATH}`)
  const xmlContent = fs.readFileSync(INPUT_PATH!, "utf-8")
  console.log(`   大小: ${(xmlContent.length / 1024).toFixed(0)} KB`)

  const products = parseWXR(xmlContent)

  console.log()
  console.log(`✅ 解析出 ${products.length} 個商品`)

  // 統計
  const totalImages = products.reduce((s, p) => s + p.images.length, 0)
  const totalVariations = products.reduce((s, p) => s + p.variations.length, 0)
  const withDesc = products.filter(p => p.description.length > 0).length

  console.log(`   📷 ${totalImages} 張圖片`)
  console.log(`   🔄 ${totalVariations} 個變體`)
  console.log(`   📝 ${withDesc} 個有描述`)

  // 列印每個商品
  console.log()
  for (const p of products) {
    console.log(`  • ${p.name}`)
    console.log(`    slug: ${p.slug} | SKU: ${p.sku || "—"} | 價格: $${p.price}`)
    console.log(`    分類: ${p.categories.map(c => c.name).join(", ") || "—"}`)
    console.log(`    描述: ${p.description.substring(0, 60).replace(/\n/g, " ")}${p.description.length > 60 ? "..." : ""}`)
    console.log(`    圖片: ${p.images.length} 張 | 變體: ${p.variations.length} 個`)
    console.log()
  }

  // 輸出
  const outputDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(products, null, 2), "utf-8")
  console.log(`💾 已儲存至: ${OUTPUT_PATH}`)
  console.log()
  console.log(`下一步：執行匯入`)
  console.log(`  npx tsx scripts/import-products.ts ${OUTPUT_PATH}`)
  console.log(`  npx tsx scripts/import-products.ts ${OUTPUT_PATH} --dry-run  # 先預覽`)
}

main().catch(err => {
  console.error("❌ 執行失敗:", err)
  process.exit(1)
})
