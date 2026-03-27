import { createHmac } from "crypto"
import { timingSafeEqual } from "crypto"

// PChomePay CheckMacValue: sort params alphabetically, URL encode, wrap with HashKey/HashIV
export function buildCheckMacValue(params: Record<string, string>, hashKey: string, hashIV: string): string {
  const sorted = Object.keys(params).sort().reduce((acc, k) => ({ ...acc, [k]: params[k] }), {} as Record<string, string>)
  const str = `HashKey=${hashKey}&${new URLSearchParams(sorted).toString()}&HashIV=${hashIV}`
  const encoded = encodeURIComponent(str).toLowerCase()
    .replace(/%20/g, "+").replace(/%21/g, "!").replace(/%28/g, "(").replace(/%29/g, ")")
    .replace(/%2a/g, "*").replace(/%2d/g, "-").replace(/%2e/g, ".").replace(/%5f/g, "_")
  return createHmac("sha256", hashKey).update(encoded).digest("hex").toUpperCase()
}

export function verifyCheckMacValue(params: Record<string, string>, hashKey: string, hashIV: string): boolean {
  const { CheckMacValue, ...rest } = params
  if (!CheckMacValue) return false
  const expected = buildCheckMacValue(rest, hashKey, hashIV)
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(CheckMacValue.toUpperCase()))
  } catch { return false }
}
