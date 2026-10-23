/**
 * 換掉 SETTINGS_ENCRYPTION_KEY：把 app_settings 每一列用舊金鑰解開、用新金鑰加回去。
 *
 * 為什麼需要這支：設定值是 AES-256-GCM 加密存在 app_settings.value_enc，金鑰只
 * 有一把。直接把環境變數換成新金鑰，舊的密文就解不開了 —— 而 settings.ts 的
 * getSetting() 解不開時**回傳 null 然後退回 process.env**，不會丟錯、不會留下
 * 任何畫面上的訊息。於是沒有對應環境變數的設定（綠界 HashKey、街口 secret…）
 * 會安靜地變成「沒有設定」，金流當場停掉而沒有人知道為什麼。所以金鑰不能單獨換。
 *
 * 跑在哪：自己的電腦就可以，不必部署（只需要資料庫連線和兩把金鑰）。
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   FROM_ENCRYPTION_KEY=<舊的64位hex> TO_ENCRYPTION_KEY=<新的64位hex> \
 *   npx tsx apps/api/scripts/rotate-settings-key.ts
 *
 * 預設是試跑（只檢查、不寫入）。確認輸出沒問題之後，加 DRY_RUN=false 真的寫。
 *
 * 可以重跑：已經是新金鑰的列會被認出來並跳過，所以中途失敗再跑一次是安全的。
 * 每一列都先「用新金鑰解回來跟原文比對」確認無誤才寫，比對不過就中止，
 * 不會留下一半新一半舊又解不開的資料。
 *
 * 順序：先跑這支（DRY_RUN=false），成功之後才把 Railway 的 SETTINGS_ENCRYPTION_KEY
 * 換成新的。反過來做會有一段時間設定全部讀不到。
 */
import { createClient } from "@supabase/supabase-js"
import { decryptWithKey, encryptWithKey, parseSettingsKey } from "../src/lib/settings"

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const fromKey = process.env.FROM_ENCRYPTION_KEY
const toKey = process.env.TO_ENCRYPTION_KEY
// 預設試跑。這支會覆寫每一筆設定，預設就寫入太危險。
const dryRun = process.env.DRY_RUN !== "false"

const HEX64 = /^[0-9a-fA-F]{64}$/

if (!url || !serviceKey || !fromKey || !toKey) {
  console.error(
    "缺少環境變數：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / FROM_ENCRYPTION_KEY / TO_ENCRYPTION_KEY",
  )
  process.exit(1)
}
for (const [name, k] of [
  ["FROM_ENCRYPTION_KEY", fromKey],
  ["TO_ENCRYPTION_KEY", toKey],
] as const) {
  if (!HEX64.test(k)) {
    console.error(`${name} 必須是 64 個十六進位字元（32 bytes）`)
    process.exit(1)
  }
}
if (fromKey.toLowerCase() === toKey.toLowerCase()) {
  console.error("新舊金鑰一樣，沒有東西要換")
  process.exit(1)
}

// 加解密直接用 settings.ts 匯出的那一組 —— 不自己複製演算法，格式才不會走鐘。
const oldKeyBuf = parseSettingsKey(fromKey)
const newKeyBuf = parseSettingsKey(toKey)
const encrypt = (plain: string, key: Buffer) => encryptWithKey(plain, key)
const decrypt = (b64: string, key: Buffer) => decryptWithKey(b64, key)

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: rows, error } = await supabase
    .from("app_settings")
    .select("key, value_enc")
    .order("key", { ascending: true })
  if (error) {
    throw new Error(`讀取 app_settings 失敗：${error.message}`)
  }

  const all = (rows ?? []) as Array<{ key: string; value_enc: string | null }>
  let rotated = 0
  let already = 0
  let empty = 0
  const broken: string[] = []

  for (const row of all) {
    if (!row.value_enc) {
      empty++
      continue
    }

    // 已經是新金鑰的（上一次跑到一半中斷）直接跳過，讓這支可以重跑。
    try {
      decrypt(row.value_enc, newKeyBuf)
      already++
      console.log(`  跳過 ${row.key}（已經是新金鑰）`)
      continue
    } catch {
      // 還沒換，往下走
    }

    let plain: string
    try {
      plain = decrypt(row.value_enc, oldKeyBuf)
    } catch {
      // 兩把都解不開 —— 不要硬寫，先讓人看清楚是哪幾筆。
      broken.push(row.key)
      console.error(`  ✗ ${row.key}：舊金鑰與新金鑰都解不開`)
      continue
    }

    const next = encrypt(plain, newKeyBuf)
    // 寫進去之前先確認新密文解得回原文。少了這一步，一個寫錯的值會變成
    // 永久遺失的設定（原文只存在密文裡，沒有別的地方可以對照）。
    if (decrypt(next, newKeyBuf) !== plain) {
      throw new Error(`${row.key}：新密文驗證失敗，中止`)
    }

    if (!dryRun) {
      const { error: upErr } = await supabase
        .from("app_settings")
        .update({ value_enc: next })
        .eq("key", row.key)
      if (upErr) {
        throw new Error(`${row.key}：寫入失敗 ${upErr.message}，中止`)
      }
    }
    rotated++
    // 值本身絕對不印出來 —— 這支的輸出常常會被貼到別的地方。
    console.log(`  ${dryRun ? "[試跑]" : "[已寫入]"} ${row.key}（${plain.length} 字元）`)
  }

  console.log("")
  console.log(`共 ${all.length} 筆：換了 ${rotated}、已是新金鑰 ${already}、空值 ${empty}`)
  if (broken.length > 0) {
    console.error(`解不開的 ${broken.length} 筆：${broken.join("、")}`)
    console.error("這幾筆要在後台重新輸入一次，不要繼續換金鑰。")
    // process.exit 會在 Windows 上留下 libuv 的 assertion 訊息，看起來像當掉了。
    process.exitCode = 1
    return
  }
  if (dryRun) {
    console.log("這是試跑，什麼都沒有寫入。確認無誤後加 DRY_RUN=false 再跑一次。")
  } else {
    console.log("寫入完成。現在才可以把 Railway 的 SETTINGS_ENCRYPTION_KEY 換成新的。")
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
