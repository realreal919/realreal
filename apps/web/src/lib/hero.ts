import type { HeroSlide } from "@/components/catalog/HeroCarousel"

/**
 * 首頁主視覺的共用規則。前台（app/page.tsx）與後台編輯頁（admin/settings/hero）
 * 都讀這裡 —— 比例各寫一份的話，後台放行的圖前台會被裁，而且沒人看得出為什麼。
 */

/**
 * 主視覺的框。輪播每一張都套這個比例（object-cover）。
 *
 * 要改整個輪播的比例就改這兩個數字 —— 但先確認每一張現有的圖在新比例下
 * 不會被裁到字。目前這組是 2026-11 那張主視覺的原始尺寸。
 */
export const HERO_RATIO_W = 1672
export const HERO_RATIO_H = 941
export const HERO_RATIO = HERO_RATIO_W / HERO_RATIO_H

/** 後台判斷「這張圖的比例可不可以用」的寬容度。1% 讓 1920×1080 這種同比例不同尺寸過關。 */
export const HERO_RATIO_TOLERANCE = 0.01

/** 低於這個寬度的圖拉到滿版會糊。只提醒，不擋。 */
export const HERO_MIN_WIDTH = 1200

/** 連 site_contents 都讀不到時的退路圖。 */
export const HERO_FALLBACK = "/home/banner.jpg"

export type HeroContent = {
  heading?: string
  subheading?: string
  cta_text?: string
  cta_link?: string
  image?: string
  /**
   * 輪播用的多張主視覺。有填就用這個，`image` 只當作舊資料的退路。
   *
   * 每一筆可以是網址字串，或 `{ src, alt }`。圖上有實質資訊（檢驗結果、
   * 保固之類）的要寫 alt；純情境照留空字串就好。
   *
   * 放在 site_contents.homepage_hero 裡，所以換圖、加圖、調順序都是改資料，
   * 不用重新部署。後台在 設定 → 首頁主視覺。
   */
  images?: Array<string | { src?: string; alt?: string }>
}

/** site_contents 的 images 可能是字串或物件，兩種都收；沒有 src 的丟掉。 */
export function heroSlides(content?: HeroContent | null): HeroSlide[] {
  const raw = content?.images
  if (Array.isArray(raw) && raw.length > 0) {
    const out = raw
      .map((it) => (typeof it === "string" ? { src: it, alt: "" } : { src: it?.src ?? "", alt: it?.alt ?? "" }))
      .filter((it) => it.src.trim().length > 0)
    if (out.length > 0) return out
  }
  return [{ src: content?.image || HERO_FALLBACK, alt: "" }]
}

/** 這張圖的比例能不能放進主視覺輪播。回 null ＝ 可以。 */
export function heroRatioProblem(width: number, height: number): string | null {
  if (!width || !height) return "讀不到這張圖的尺寸"
  const ratio = width / height
  if (Math.abs(ratio - HERO_RATIO) / HERO_RATIO > HERO_RATIO_TOLERANCE) {
    return `比例不符：這張是 ${width}×${height}（${ratio.toFixed(2)}:1），`
      + `主視覺要 ${HERO_RATIO.toFixed(2)}:1（例如 ${HERO_RATIO_W}×${HERO_RATIO_H}）。`
      + "比例不同的圖會被裁掉邊邊。"
  }
  return null
}
