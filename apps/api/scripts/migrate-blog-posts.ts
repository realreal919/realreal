import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

// ---------------------------------------------------------------------------
// Config & Supabase client (follows seed-admin.ts pattern)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const postsFileArg = args.find(a => !a.startsWith("--"))
const POSTS_FILE = postsFileArg || "./wordpress/posts.json"
const URL_MAP_FILE = args.find(a => a.startsWith("--url-map="))?.split("=")[1] ?? "./wordpress/url-map.json"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WpPost {
  title: string
  slug: string
  content_html: string
  excerpt?: string
  cover_image?: string | null
  status: string
  author_email?: string
  author_id?: string
  published_at?: string | null
  seo_title?: string | null
  seo_description?: string | null
  categories?: string[]
  tags?: string[]
}

// ---------------------------------------------------------------------------
// WordPress content helpers
// ---------------------------------------------------------------------------

/** Strip common WordPress shortcodes from HTML content. */
function stripWpShortcodes(html: string): string {
  // Remove self-closing shortcodes: [shortcode attr="val" /]
  let cleaned = html.replace(/\[\/?\w[\w-]*(?:\s[^\]]*?)?\s*\/?\]/g, "")
  // Remove leftover opening/closing shortcode pairs that wrap content
  // e.g. [caption id="x"]...[/caption]
  cleaned = cleaned.replace(/\[\/?(?:caption|gallery|embed|video|audio|playlist|wp_caption|sourcecode|code|vc_\w+|et_pb_\w+)\b[^\]]*\]/gi, "")
  return cleaned
}

/** Replace old WordPress image URLs using a mapping file. */
function remapImageUrls(html: string, urlMap: Record<string, string>): string {
  let result = html
  for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
    result = result.replaceAll(oldUrl, newUrl)
  }
  return result
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// ---------------------------------------------------------------------------
// Lookup / create helpers
// ---------------------------------------------------------------------------

/** Resolve an author email to a user id. Returns null if not found. */
async function resolveAuthorId(email: string): Promise<string | null> {
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
    if (error) return null
    const found = data.users.find(u => u.email === email)
    if (found) return found.id
    if (data.users.length < 50) break
    page++
  }
  return null
}

/** Get or create a post_category by name. Returns UUID. */
async function getOrCreateCategory(name: string): Promise<string> {
  const slug = slugify(name)
  const { data: existing } = await supabase
    .from("post_categories")
    .select("id")
    .eq("slug", slug)
    .single()

  if (existing) return existing.id

  if (DRY_RUN) return `dry-run-category-${slug}`

  const { data: created, error } = await supabase
    .from("post_categories")
    .insert({ name, slug })
    .select("id")
    .single()

  if (error || !created) {
    throw new Error(`Failed to create category "${name}": ${error?.message}`)
  }
  return created.id
}

/** Get or create a post_tag by name. Returns UUID. */
async function getOrCreateTag(name: string): Promise<string> {
  const slug = slugify(name)
  const { data: existing } = await supabase
    .from("post_tags")
    .select("id")
    .eq("slug", slug)
    .single()

  if (existing) return existing.id

  if (DRY_RUN) return `dry-run-tag-${slug}`

  const { data: created, error } = await supabase
    .from("post_tags")
    .insert({ name, slug })
    .select("id")
    .single()

  if (error || !created) {
    throw new Error(`Failed to create tag "${name}": ${error?.message}`)
  }
  return created.id
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------

async function migrate() {
  console.log(`--- WordPress Blog Post Migration ---`)
  console.log(`Posts file : ${POSTS_FILE}`)
  console.log(`URL map   : ${URL_MAP_FILE}`)
  if (DRY_RUN) console.log(`Mode      : DRY RUN (no writes)`)
  console.log()

  // Load posts JSON
  const postsPath = path.resolve(POSTS_FILE)
  if (!fs.existsSync(postsPath)) {
    console.error(`Posts file not found: ${postsPath}`)
    console.error(`Create one from the template: scripts/templates/posts-template.json`)
    process.exit(1)
  }
  const posts: WpPost[] = JSON.parse(fs.readFileSync(postsPath, "utf-8"))

  // Load optional URL mapping
  const urlMapPath = path.resolve(URL_MAP_FILE)
  let urlMap: Record<string, string> = {}
  if (fs.existsSync(urlMapPath)) {
    urlMap = JSON.parse(fs.readFileSync(urlMapPath, "utf-8"))
    console.log(`Loaded ${Object.keys(urlMap).length} URL mappings`)
  } else {
    console.log(`No URL map file found — skipping image URL remapping`)
  }

  // Stats
  let imported = 0
  let skipped = 0
  let errors = 0
  const categoriesCreated = new Set<string>()
  const tagsCreated = new Set<string>()

  for (const [index, post] of posts.entries()) {
    const label = `[${index + 1}/${posts.length}] "${post.title}"`
    try {
      // Check if slug already exists
      const { data: existing } = await supabase
        .from("posts")
        .select("id")
        .eq("slug", post.slug)
        .single()

      if (existing) {
        console.log(`${label} — skipped (slug already exists)`)
        skipped++
        continue
      }

      // Clean content
      let content = post.content_html || ""
      content = stripWpShortcodes(content)
      if (Object.keys(urlMap).length > 0) {
        content = remapImageUrls(content, urlMap)
      }

      // Map status: WordPress "publish" -> "published", everything else -> "draft"
      const status = post.status === "publish" || post.status === "published"
        ? "published"
        : "draft"

      // Resolve author
      let authorId = post.author_id || null
      if (!authorId && post.author_email) {
        authorId = await resolveAuthorId(post.author_email)
        if (!authorId) {
          console.log(`  Warning: author "${post.author_email}" not found — setting author_id to null`)
        }
      }

      // Resolve first category (posts table has a single category_id)
      let categoryId: string | null = null
      if (post.categories && post.categories.length > 0) {
        categoryId = await getOrCreateCategory(post.categories[0])
        for (const cat of post.categories) {
          categoriesCreated.add(slugify(cat))
        }
      }

      // Resolve tags
      const tagIds: string[] = []
      if (post.tags && post.tags.length > 0) {
        for (const tagName of post.tags) {
          const tagId = await getOrCreateTag(tagName)
          tagIds.push(tagId)
          tagsCreated.add(slugify(tagName))
        }
      }

      // Also create additional categories (beyond the first) so they exist in the system
      if (post.categories && post.categories.length > 1) {
        for (const cat of post.categories.slice(1)) {
          await getOrCreateCategory(cat)
        }
      }

      if (DRY_RUN) {
        console.log(`${label} — would insert (status: ${status}, category: ${categoryId}, tags: ${tagIds.length})`)
        imported++
        continue
      }

      // Insert post
      const { data: inserted, error: insertError } = await supabase
        .from("posts")
        .insert({
          title: post.title,
          slug: post.slug,
          content_html: content,
          excerpt: post.excerpt || null,
          cover_image: post.cover_image || null,
          status,
          author_id: authorId,
          category_id: categoryId,
          published_at: post.published_at || null,
          seo_title: post.seo_title || null,
          seo_description: post.seo_description || null,
        })
        .select("id")
        .single()

      if (insertError || !inserted) {
        throw new Error(`Insert failed: ${insertError?.message}`)
      }

      // Link tags
      if (tagIds.length > 0) {
        const tagLinks = tagIds.map(tag_id => ({ post_id: inserted.id, tag_id }))
        const { error: linkError } = await supabase
          .from("post_tag_links")
          .insert(tagLinks)
        if (linkError) {
          console.log(`  Warning: failed to link tags for "${post.title}": ${linkError.message}`)
        }
      }

      console.log(`${label} — imported (status: ${status})`)
      imported++
    } catch (err: any) {
      console.error(`${label} — ERROR: ${err.message}`)
      errors++
    }
  }

  // Summary
  console.log()
  console.log(`--- Migration Summary ---`)
  if (DRY_RUN) console.log(`(DRY RUN — no data was written)`)
  console.log(`Total posts in file : ${posts.length}`)
  console.log(`Imported            : ${imported}`)
  console.log(`Skipped (duplicate) : ${skipped}`)
  console.log(`Errors              : ${errors}`)
  console.log(`Categories touched  : ${categoriesCreated.size}`)
  console.log(`Tags touched        : ${tagsCreated.size}`)

  if (errors > 0) {
    process.exit(1)
  }
}

migrate().catch(err => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
