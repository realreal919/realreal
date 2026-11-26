/**
 * 「現貨優惠組合」—— 蛋白粉分類頁的一區，同時出現在首頁與商品選購下拉選單。
 *
 * 三個地方要講同一件事（區塊標題、首頁那一區、導覽列那一項），所以標題、錨點
 * 與「哪些商品算在內」都收在這裡一份。各自寫一份的話，活動結束只下架一處，
 * 其他地方就會留著一個點進去什麼都沒有的入口 —— 導覽列那一項尤其明顯，
 * 它在每一頁都看得到。
 *
 * 判準本身還是 classifyProteinProduct：店主在後台規格 attributes 加上或刪掉
 * 「現貨優惠組」那一欄，這三個地方會同時跟著變，不必改程式。
 */
import { getProducts } from "@/lib/catalog"
import type { Product } from "@/lib/catalog"
import { classifyProteinProduct } from "@/lib/protein-series"

export const INSTOCK_TITLE = "現貨優惠組合"
export const INSTOCK_SUBTITLE = "補給不中斷"

/** 分類頁上那一區的 id；導覽列與首頁的連結都指到它。 */
export const INSTOCK_ANCHOR = "instock-offers"
export const INSTOCK_HREF = `/category/plant-based-powder#${INSTOCK_ANCHOR}`

export async function getInstockOffers(): Promise<Product[]> {
  try {
    const { data } = await getProducts({
      category: "plant-based-powder",
      limit: 24,
      sort: "price_desc",
    })
    return data.filter((p) => classifyProteinProduct(p) === "instock")
  } catch {
    // 取不到就當作沒有 —— 導覽列寧可少一項，也不要多一個點進去是空的入口。
    return []
  }
}
