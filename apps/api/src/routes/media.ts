import { Router } from "express"
import multer from "multer"
import path from "path"
import crypto from "crypto"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/admin"
import { z } from "zod"

export const mediaRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

const STORAGE_BUCKET = "media"
const PROJECT_REF = "oqzloydhoekvgncfvddh"

const updateSchema = z.object({
  alt_text: z.string(),
})

// GET /admin/media — paginated list, filter by mime_type
mediaRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from("media")
    .select("id, url, filename, mime_type, size_bytes, alt_text, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (req.query.mime_type) {
    query = query.eq("mime_type", req.query.mime_type as string)
  }

  const { data, error, count } = await query
  if (error) { res.status(500).json({ error: error.message }); return }

  res.json({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  })
})

// POST /admin/media/upload — upload file to Supabase Storage + insert record
mediaRouter.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file
  if (!file) { res.status(400).json({ error: "No file provided" }); return }

  const ext = path.extname(file.originalname).toLowerCase()
  const timestamp = Date.now()
  const random = crypto.randomBytes(8).toString("hex")
  const storagePath = `uploads/${timestamp}-${random}${ext}`

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    })

  if (uploadError) { res.status(500).json({ error: uploadError.message }); return }

  const publicUrl = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`

  const { data, error: insertError } = await supabase
    .from("media")
    .insert({
      url: publicUrl,
      filename: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
    })
    .select()
    .single()

  if (insertError) { res.status(500).json({ error: insertError.message }); return }
  res.status(201).json({ data })
})

// PUT /admin/media/:id — update alt_text only
mediaRouter.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { data, error } = await supabase
    .from("media")
    .update({ alt_text: parsed.data.alt_text })
    .eq("id", req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!data) { res.status(404).json({ error: "Media not found" }); return }
  res.json({ data })
})

// DELETE /admin/media/:id — admin only, delete from storage + delete record
mediaRouter.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  // Fetch the record first to get the storage path
  const { data: record, error: fetchError } = await supabase
    .from("media")
    .select("id, url")
    .eq("id", req.params.id)
    .single()

  const err = fetchError as { code?: string; message?: string } | null
  if (!record || (err && err.code === "PGRST116")) {
    res.status(404).json({ error: "Media not found" }); return
  }
  if (err) { res.status(500).json({ error: err.message }); return }

  // Extract storage path from URL
  const prefix = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${STORAGE_BUCKET}/`
  const storagePath = record.url.replace(prefix, "")

  const { error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath])

  if (storageError) { res.status(500).json({ error: storageError.message }); return }

  const { error: deleteError } = await supabase
    .from("media")
    .delete()
    .eq("id", req.params.id)

  if (deleteError) { res.status(500).json({ error: deleteError.message }); return }
  res.status(204).send()
})
