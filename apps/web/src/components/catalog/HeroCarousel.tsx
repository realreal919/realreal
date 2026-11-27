"use client"

import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"

export type HeroSlide = {
  src: string
  /** 空字串＝純裝飾，螢幕閱讀器會略過。圖上有實質資訊（例如檢驗結果）就要寫。 */
  alt: string
}

type Props = {
  slides: HeroSlide[]
  /** 所有張共用的框。見下方 object-cover 的註解。 */
  ratioW: number
  ratioH: number
  /** 自動輪播間隔（毫秒）。0 ＝不自動播。 */
  autoPlayMs?: number
}

/** 使用者剛碰過之後，暫停自動輪播多久 */
const RESUME_AFTER_MS = 8000

/**
 * 首頁主視覺輪播。
 *
 * **滑動用原生捲動（scroll-snap），不自己接 touch 事件。** 手機上得到的是系統
 * 原生的慣性與回彈，鍵盤與輔助技術也照原本的方式運作；自己算手指位移做出來的
 * 那種「滑動」在慢速拖曳、邊緣回彈、滑到一半放開這些情況都會怪。這也是本站
 * RetailCarousel 既有的做法。
 *
 * **每張圖都套同一個固定比例的框（object-cover）。** 兩張圖比例不同的話，
 * 用 h-auto 會讓整頁在換張時上下跳動 —— 主視覺下面的內容跟著位移，比裁掉
 * 幾個像素糟得多。所以寧可裁：換圖時請沿用同比例（目前 1672×941）。
 */
export function HeroCarousel({ slides, ratioW, ratioH, autoPlayMs = 6000 }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const pausedUntil = useRef(0)

  const goTo = useCallback((idx: number) => {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: el.clientWidth * idx, behavior: "smooth" })
  }, [])

  // 目前在第幾張由捲動位置決定，不另外存一份「應該在第幾張」——
  // 存兩份狀態的話，使用者用手滑的那一次就會跟圓點對不起來。
  const onScroll = useCallback(() => {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    setCurrent(Math.round(el.scrollLeft / el.clientWidth))
  }, [])

  const pause = useCallback(() => {
    pausedUntil.current = Date.now() + RESUME_AFTER_MS
  }, [])

  useEffect(() => {
    if (slides.length < 2 || autoPlayMs <= 0) return
    // 使用者說不要動畫就不要自己動。這是系統層級的無障礙設定。
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return
      const el = trackRef.current
      if (!el || el.clientWidth === 0) return
      const at = Math.round(el.scrollLeft / el.clientWidth)
      el.scrollTo({ left: el.clientWidth * ((at + 1) % slides.length), behavior: "smooth" })
    }, autoPlayMs)
    return () => clearInterval(timer)
  }, [slides.length, autoPlayMs])

  if (slides.length === 0) return null

  // 只有一張就不要輪播的外框。多包一層捲動容器只會多一個會出錯的東西。
  if (slides.length === 1) {
    return (
      <section>
        <HeroImage slide={slides[0]} ratioW={ratioW} ratioH={ratioH} priority />
      </section>
    )
  }

  return (
    <section
      className="relative group"
      aria-roledescription="carousel"
      aria-label="首頁主視覺"
      onMouseEnter={pause}
      onPointerDown={pause}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.src}
            className="w-full shrink-0 snap-center"
            role="group"
            aria-roledescription="slide"
            aria-label={`第 ${i + 1} 張，共 ${slides.length} 張`}
          >
            <HeroImage slide={slide} ratioW={ratioW} ratioH={ratioH} priority={i === 0} />
          </div>
        ))}
      </div>

      {/* 左右鍵只在桌機出現：手機用滑的，箭頭會壓到圖 */}
      <button
        type="button"
        onClick={() => { pause(); goTo((current - 1 + slides.length) % slides.length) }}
        aria-label="上一張"
        className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-white/70 hover:bg-white text-[#10305a] shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <span aria-hidden="true" className="text-xl leading-none">&#8249;</span>
      </button>
      <button
        type="button"
        onClick={() => { pause(); goTo((current + 1) % slides.length) }}
        aria-label="下一張"
        className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 items-center justify-center rounded-full bg-white/70 hover:bg-white text-[#10305a] shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <span aria-hidden="true" className="text-xl leading-none">&#8250;</span>
      </button>

      {/* 圓點襯一層半透明白底：深色的 banner 上，深藍圓點會整組消失。
          跟上下一張的按鈕同一種底，看起來是一套的。 */}
      <div className="absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 flex gap-2 rounded-full bg-white/70 px-2.5 py-1.5">
        {slides.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => { pause(); goTo(i) }}
            aria-label={`切到第 ${i + 1} 張`}
            aria-current={i === current}
            className="w-2 h-2 rounded-full transition-colors"
            style={{
              backgroundColor: i === current ? "#10305a" : "rgba(16,48,90,0.28)",
              outlineOffset: 3,
            }}
          />
        ))}
      </div>
    </section>
  )
}

function HeroImage({
  slide, ratioW, ratioH, priority,
}: { slide: HeroSlide; ratioW: number; ratioH: number; priority: boolean }) {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${ratioW} / ${ratioH}` }}>
      {/* 首頁流量最大的圖。用 next/image 而不是 <img>：主視覺放在 Supabase
          Storage，直接 <img> 等於每個訪客每次重整都去 Supabase 重抓原檔
          （2026-11 的 Cached Egress 超額就是這樣來的）。走 next/image 之後
          由 Vercel 抓一次、轉檔縮圖，再從它的 CDN 送出去。 */}
      <Image
        src={slide.src}
        alt={slide.alt}
        fill
        sizes="100vw"
        priority={priority}
        className="object-cover"
      />
    </div>
  )
}
