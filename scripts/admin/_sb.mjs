// 讀 apps/api/.env 的 Supabase 連線資料。金鑰不會被印出來。
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const env = fs.readFileSync(path.join(root, "apps/api/.env"), "utf8")
const read = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "")

const URL_ = read("SUPABASE_URL")
const KEY = read("SUPABASE_SERVICE_ROLE_KEY")

export async function sb(pathname, init = {}) {
  const res = await fetch(`${URL_}/rest/v1${pathname}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.method && init.method !== "GET" ? { Prefer: "return=representation" } : {}),
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${pathname} ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

/** 沒加 --apply 就只試算，不寫入。 */
export const APPLY = process.argv.includes("--apply")
