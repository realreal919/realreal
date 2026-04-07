"use client"

import Image from "next/image"
import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const reviewImages = [
  { src: "https://realreal.cc/wp-content/uploads/2026/02/S__73097241_0-576x1024.jpg", alt: "顧客回饋 1" },
  { src: "https://realreal.cc/wp-content/uploads/2026/02/S__73097242_0-576x1024.jpg", alt: "顧客回饋 2" },
  { src: "https://realreal.cc/wp-content/uploads/2026/02/回饋5-576x1024.jpg", alt: "顧客回饋 3" },
  { src: "https://realreal.cc/wp-content/uploads/2026/02/回饋1-576x1024.jpg", alt: "顧客回饋 4" },
  { src: "https://realreal.cc/wp-content/uploads/2026/02/回饋2-576x1024.jpg", alt: "顧客回饋 5" },
  { src: "https://realreal.cc/wp-content/uploads/2026/02/回饋3-576x1024.jpg", alt: "顧客回饋 6" },
  { src: "https://realreal.cc/wp-content/uploads/2026/02/回饋4-653x1024.jpg", alt: "顧客回饋 7" },
  { src: "https://realreal.cc/wp-content/uploads/2026/02/FCF1A2D1-116B-4048-A859-ECA627D3CFEB-576x1024.jpg", alt: "顧客回饋 8" },
]

const ITEMS_PER_PAGE = 4
const TOTAL_PAGES = Math.ceil(reviewImages.length / ITEMS_PER_PAGE)

export function ReviewImagesCarousel() {
  const [page, setPage] = useState(0)

  const visibleImages = reviewImages.slice(
    page * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE + ITEMS_PER_PAGE
  )

  return (
    <div className="mt-10">
      {/* Image grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {visibleImages.map((img) => (
          <div key={img.src} className="overflow-hidden rounded-[10px] shadow-sm">
            <Image
              src={img.src}
              alt={img.alt}
              width={576}
              height={1024}
              className="w-full h-auto object-cover"
              unoptimized
            />
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-[#10305a] text-[#10305a] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#10305a] hover:text-white transition-colors"
          aria-label="上一頁"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Dots */}
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i === page ? "bg-[#10305a]" : "bg-[#10305a]/25"
              }`}
              aria-label={`第 ${i + 1} 頁`}
            />
          ))}
        </div>

        <button
          onClick={() => setPage((p) => Math.min(TOTAL_PAGES - 1, p + 1))}
          disabled={page === TOTAL_PAGES - 1}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-[#10305a] text-[#10305a] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#10305a] hover:text-white transition-colors"
          aria-label="下一頁"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
