import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { RateLimiter } from "../lib/rate-limit"

export const authEmailRouter = Router()

/**
 * 這支端點會誠實回答「這個信箱註冊過了嗎」，所以它本身就是一個帳號列舉工具。
 *
 * 這是店主 2026-10-10 的決定，取捨講清楚：藏起來擋到的是「有人知道某個 email
 * 在這裡買過東西」（食品電商，敏感度低）；藏起來造成的是沒註冊的人一直等一封
 * 不存在的信，而且不知道下一步該做什麼——店主自己就卡過。
 *
 * 既然要誠實，唯一能做的就是壓低速度：同一個 IP 每分鐘 10 次。要把幾萬個
 * email 試完，這個速度不划算。訊息寫法擋不住腳本，頻率限制才擋得住。
 */
const limiter = new RateLimiter(10, 60_000)

authEmailRouter.post("/email-exists", async (req, res) => {
  // Railway 在前面有代理，req.ip 會是代理的位址，要看 x-forwarded-for 的第一段
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim()
  const key = forwarded || req.ip || "unknown"

  const verdict = limiter.check(key)
  if (!verdict.allowed) {
    res.setHeader("Retry-After", String(verdict.retryAfterSec))
    res.status(429).json({ error: "查詢太頻繁，請稍後再試" })
    return
  }

  const parsed = z.object({ email: z.string().email() }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "請輸入有效的 Email" })
    return
  }

  try {
    // auth.users 不在 PostgREST 的 schema 裡，站上本來就有這支 RPC 做反查
    const { data, error } = await supabase.rpc("get_user_id_by_email", {
      p_email: parsed.data.email.toLowerCase(),
    })
    if (error) throw new Error(error.message)
    res.json({ exists: !!data })
  } catch (err) {
    // 查不出來時回報錯誤，不要猜。猜「不存在」會讓真的有帳號的人被叫去註冊，
    // 而註冊又會失敗（信箱已被使用），他會卡在兩個畫面之間。
    console.error("[auth/email-exists] 查詢失敗:", err)
    res.status(500).json({ error: "查詢失敗，請稍後再試" })
  }
})
