import { supabase } from "./supabase"

function getEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error("Missing TOKEN_ENCRYPTION_KEY")
  return key
}

export async function encryptToken(plainText: string): Promise<string> {
  const { data, error } = await supabase.rpc("encrypt_token", {
    plain_text: plainText,
    encryption_key: getEncryptionKey(),
  })
  if (error) throw new Error(`Token encryption failed: ${error.message}`)
  return data as string
}

export async function decryptToken(cipherText: string): Promise<string> {
  const { data, error } = await supabase.rpc("decrypt_token", {
    cipher_text: cipherText,
    encryption_key: getEncryptionKey(),
  })
  if (error) throw new Error(`Token decryption failed: ${error.message}`)
  return data as string
}
