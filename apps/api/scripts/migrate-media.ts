import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import path from "path"
import crypto from "crypto"

// ---------------------------------------------------------------------------
// Config & CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const manifestIndex = args.indexOf("--manifest")
const dirIndex = args.indexOf("--dir")

const MANIFEST_PATH = manifestIndex !== -1 ? args[manifestIndex + 1] : null
const UPLOADS_DIR = dirIndex !== -1 ? args[dirIndex + 1] : "./wordpress/uploads"

const STORAGE_BUCKET = "media"
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "rywrdbqllbbeptudqmom"

// ---------------------------------------------------------------------------
// Supabase client (same pattern as seed-admin.ts)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestEntry {
  wordpress_url: string
  local_path: string
  alt_text?: string
  mime_type?: string
}

interface UrlMapping {
  wordpress_url: string
  supabase_url: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
}

function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return MIME_MAP[ext] ?? "application/octet-stream"
}

function collectFiles(dir: string): string[] {
  const results: string[] = []

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else {
        results.push(full)
      }
    }
  }

  walk(dir)
  return results
}

function buildStoragePath(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const timestamp = Date.now()
  const random = crypto.randomBytes(8).toString("hex")
  return `uploads/${timestamp}-${random}${ext}`
}

// ---------------------------------------------------------------------------
// Build the list of files to migrate
// ---------------------------------------------------------------------------

function buildFileList(): ManifestEntry[] {
  if (MANIFEST_PATH) {
    if (!fs.existsSync(MANIFEST_PATH)) {
      console.error(`Manifest file not found: ${MANIFEST_PATH}`)
      process.exit(1)
    }
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"))
    const entries: ManifestEntry[] = (raw.images ?? raw).map((item: ManifestEntry) => ({
      wordpress_url: item.wordpress_url ?? "",
      local_path: item.local_path,
      alt_text: item.alt_text ?? "",
      mime_type: item.mime_type,
    }))
    return entries
  }

  // Scan directory
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.error(`Uploads directory not found: ${UPLOADS_DIR}`)
    console.error("Use --dir <path> or --manifest <path> to specify the source")
    process.exit(1)
  }

  const files = collectFiles(UPLOADS_DIR)
  return files.map((filePath) => ({
    wordpress_url: filePath, // no WP URL available when scanning a directory
    local_path: filePath,
    alt_text: "",
  }))
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------

async function migrate() {
  console.log("=== WordPress Media Migration ===")
  if (DRY_RUN) console.log("[DRY RUN] No files will be uploaded or records inserted.\n")

  const entries = buildFileList()
  console.log(`Found ${entries.length} file(s) to process.\n`)

  // Fetch existing media filenames to detect duplicates
  const existingFilenames = new Set<string>()
  let page = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from("media")
      .select("filename")
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) {
      console.error("Failed to fetch existing media:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const row of data) existingFilenames.add(row.filename)
    if (data.length < pageSize) break
    page++
  }

  let uploaded = 0
  let skipped = 0
  let errors = 0
  const urlMappings: UrlMapping[] = []

  for (const entry of entries) {
    const localPath = entry.local_path
    const filename = path.basename(localPath)

    // Skip if already exists
    if (existingFilenames.has(filename)) {
      console.log(`  SKIP  ${filename} (already exists)`)
      skipped++
      continue
    }

    // Verify the file exists on disk
    if (!fs.existsSync(localPath)) {
      console.error(`  ERROR ${filename} — file not found: ${localPath}`)
      errors++
      continue
    }

    const mimeType = entry.mime_type ?? guessMimeType(filename)
    const stat = fs.statSync(localPath)
    const sizeBytes = stat.size
    const storagePath = buildStoragePath(filename)

    if (DRY_RUN) {
      console.log(`  [DRY] ${filename} -> ${storagePath} (${mimeType}, ${sizeBytes} bytes)`)
      uploaded++
      urlMappings.push({
        wordpress_url: entry.wordpress_url,
        supabase_url: `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`,
      })
      continue
    }

    // Upload to Supabase Storage
    const fileBuffer = fs.readFileSync(localPath)
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error(`  ERROR ${filename} — upload failed: ${uploadError.message}`)
      errors++
      continue
    }

    const publicUrl = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`

    // Insert record into media table
    const { error: insertError } = await supabase
      .from("media")
      .insert({
        url: publicUrl,
        filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        alt_text: entry.alt_text ?? "",
      })

    if (insertError) {
      console.error(`  ERROR ${filename} — db insert failed: ${insertError.message}`)
      errors++
      continue
    }

    console.log(`  OK    ${filename}`)
    uploaded++
    urlMappings.push({
      wordpress_url: entry.wordpress_url,
      supabase_url: publicUrl,
    })
  }

  // Write URL mapping file
  const mappingPath = path.resolve("url-mapping.json")
  fs.writeFileSync(mappingPath, JSON.stringify(urlMappings, null, 2))

  // Summary
  console.log("\n=== Summary ===")
  console.log(`  Uploaded: ${uploaded}`)
  console.log(`  Skipped:  ${skipped}`)
  console.log(`  Errors:   ${errors}`)
  console.log(`  URL map:  ${mappingPath}`)
  if (DRY_RUN) console.log("\n[DRY RUN] No changes were made.")
}

migrate().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
