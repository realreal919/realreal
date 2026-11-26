/**
 * 免運文案。兩次事故的回歸測試：
 *
 * 1. 跑馬燈寫死 649/999，後台實際是 650/1000 → 剛好 999 元的宅配客人被承諾
 *    免運，結帳被收 NT$150。
 * 2. 修好跑馬燈之後，FAQ 裡同一句話還留著 649，因為那是另一個檔案。
 *
 * 所以這裡鎖的不只是數字正確，而是「兩個畫面看到的是同一件事」。
 */
import { describe, it, expect } from "vitest"
import {
  campaignShippingMessages,
  cartFreeShippingHint,
  freeShippingGroups,
  marqueeShippingMessages,
  shippingFeeAnswer,
  shippingSteps,
  type ShippingConfig,
} from "../shipping-copy"

const SAME: ShippingConfig = {
  cvs: { fee: 80, free_threshold: 999 },
  cvsCod: { fee: 80, free_threshold: 999 },
  home: { fee: 150, free_threshold: 999 },
}

const SPLIT: ShippingConfig = {
  cvs: { fee: 80, free_threshold: 650 },
  cvsCod: { fee: 80, free_threshold: 1000 },
  home: { fee: 150, free_threshold: 1000 },
}

describe("免運文案", () => {
  it("★ 三種寄送方式門檻相同時，講一次「全站」而不是三句", () => {
    const groups = freeShippingGroups(SAME)
    expect(groups).toHaveLength(1)
    expect(groups[0].coversEveryMethod).toBe(true)

    expect(marqueeShippingMessages(SAME)).toEqual(["全站消費滿999元免運"])
    expect(shippingFeeAnswer(SAME)).toContain("全站消費滿 NT$999 免運")
  })

  it("★ 門檻不同時分開講，而且兩個畫面講的是同一組門檻", () => {
    expect(marqueeShippingMessages(SPLIT)).toEqual([
      "超商取貨滿650元免運",
      "超商取貨付款、宅配滿1000元免運",
    ])

    const answer = shippingFeeAnswer(SPLIT)
    expect(answer).toContain("消費滿 NT$650 超商取貨免運")
    expect(answer).toContain("消費滿 NT$1000 超商取貨付款、宅配免運")
  })

  it("★ 運費金額也來自設定，不寫死", () => {
    const answer = shippingFeeAnswer(SAME)
    expect(answer).toContain("宅配運費 NT$150")
    expect(answer).toContain("超商取貨運費 NT$80")
    expect(answer).toContain("超商取貨付款運費 NT$80")
  })

  it("★ 讀不到設定時，寧可不講免運，也不要講錯的數字", () => {
    expect(marqueeShippingMessages(null)).toEqual([])

    // 剩下的只有港澳那句（它本身含「免運活動」四個字，所以要鎖的是「有沒有
    // 講出一個門檻金額」，不是有沒有出現「免運」二字）。
    const answer = shippingFeeAnswer(null)
    expect(answer).not.toContain("消費滿")
    expect(answer).not.toContain("NT$")
    expect(answer).toBe("港澳寄送採順豐速運，運費到付，不適用滿額免運活動。")
  })
})

/**
 * 免運活動的跑馬燈文案。
 *
 * 常態門檻那句寫死過一次（649/999 對不上後台，客人在 999 被收運費）。活動這句
 * 更容易重蹈覆轍 —— 「週六超商取貨滿666免運」看起來就是一句固定的話。所以它由
 * 活動條件產生，這裡鎖住那個對應關係。
 */
describe("免運活動的跑馬燈文案", () => {
  it("★ 週六 × 超商取貨 × 666，並註明不含取貨付款", () => {
    // 「超商取貨」和「超商取貨付款」在客人眼裡是同一件事的兩種付法。活動只給
    // 前者時不講清楚，選了取貨付款的人會在結帳被收運費才發現。
    expect(
      campaignShippingMessages([{ minOrder: 666, buckets: ["cvs"], weekdays: [6] }]),
    ).toEqual(["週六超商取貨(非取貨付款)滿666元免運"])
  })

  it("★ 兩種超商方式都涵蓋時就說「超商取貨」，不加註記也不拆成兩句", () => {
    expect(
      campaignShippingMessages([
        { minOrder: 666, buckets: ["cvs", "cvsCod"], weekdays: [6] },
      ]),
    ).toEqual(["週六超商取貨滿666元免運"])
  })

  it("★ 後台改成週三宅配滿 800，文案自己跟著變", () => {
    expect(
      campaignShippingMessages([{ minOrder: 800, buckets: ["home"], weekdays: [3] }]),
    ).toEqual(["週三宅配滿800元免運"])  // 沒有超商取貨就不會出現註記
  })

  it("多天：週六日", () => {
    expect(
      campaignShippingMessages([{ minOrder: 666, buckets: ["cvs"], weekdays: [6, 0] }]),
    ).toEqual(["週六、日超商取貨(非取貨付款)滿666元免運"])
  })

  it("沒限定星期就不加星期前綴", () => {
    expect(
      campaignShippingMessages([{ minOrder: 500, buckets: ["cvs"], weekdays: [] }]),
    ).toEqual(["超商取貨(非取貨付款)滿500元免運"])
  })

  it("沒限定取貨方式就說「全站」", () => {
    expect(
      campaignShippingMessages([{ minOrder: 500, buckets: [], weekdays: [6] }]),
    ).toEqual(["週六全站滿500元免運"])
  })

  it("多種取貨方式並列", () => {
    expect(
      campaignShippingMessages([{ minOrder: 666, buckets: ["cvs", "home"], weekdays: [6] }]),
    ).toEqual(["週六超商取貨(非取貨付款)、宅配滿666元免運"])
  })

  it("★ 門檻是 0 的活動不出現在跑馬燈（那不是有效的免運條件）", () => {
    expect(campaignShippingMessages([{ minOrder: 0, buckets: ["cvs"], weekdays: [6] }])).toEqual([])
  })

  it("沒有活動時不產生任何句子", () => {
    expect(campaignShippingMessages([])).toEqual([])
  })
})

/**
 * 購物車的免運提示。2026-10-06 的回歸測試：超商降到 999、宅配留在 1300 的那段
 * 期間，提示是用宅配門檻算的，900 元的購物車會被告知「再加 400」，但他選超商
 * 其實只差 99。提示一定要講最快能免運的那條路，而且要說是哪一種寄送方式。
 */
describe("cartFreeShippingHint", () => {
  const SAT = new Date("2026-10-10T10:00:00+08:00") // 週六
  const WED = new Date("2026-10-07T10:00:00+08:00") // 週三
  const SAT_CVS = [{ minOrder: 666, buckets: ["cvs", "cvsCod"], weekdays: [6] }]

  it("三種方式同門檻：不提寄送方式", () => {
    const h = cartFreeShippingHint(SAME, 800)!
    expect(h.threshold).toBe(999)
    expect(h.methods).toBeNull()
    expect(h.remaining).toBe(199)
    expect(h.reached).toBe(false)
  })

  it("★ 門檻不一致：講最低的那一組，並標出寄送方式", () => {
    const split: ShippingConfig = {
      cvs: { fee: 80, free_threshold: 999 },
      cvsCod: { fee: 80, free_threshold: 999 },
      home: { fee: 150, free_threshold: 1300 },
    }
    const h = cartFreeShippingHint(split, 900)!
    expect(h.threshold).toBe(999)
    expect(h.remaining).toBe(99)
    expect(h.methods).toBe("超商取貨")
  })

  it("★ 週六的免運活動門檻較低時以活動為準", () => {
    const h = cartFreeShippingHint(SAME, 600, SAT_CVS, SAT)!
    expect(h.threshold).toBe(666)
    expect(h.remaining).toBe(66)
    expect(h.methods).toBe("超商取貨")
  })

  it("不是活動日就回到常態門檻", () => {
    const h = cartFreeShippingHint(SAME, 600, SAT_CVS, WED)!
    expect(h.threshold).toBe(999)
    expect(h.methods).toBeNull()
  })

  it("達標：reached 為 true，進度 100%", () => {
    const h = cartFreeShippingHint(SAME, 999)!
    expect(h.reached).toBe(true)
    expect(h.remaining).toBe(0)
    expect(h.pct).toBe(100)
  })

  it("★ 門檻 0 代表不提供免運，活動不該把它變成有免運", () => {
    const none: ShippingConfig = {
      cvs: { fee: 80, free_threshold: 0 },
      cvsCod: { fee: 80, free_threshold: 0 },
      home: { fee: 150, free_threshold: 0 },
    }
    expect(cartFreeShippingHint(none, 800, SAT_CVS, SAT)).toBeNull()
  })

  it("拿不到設定時不顯示這一條", () => {
    expect(cartFreeShippingHint(null, 800)).toBeNull()
  })
})

describe("兩種超商取貨同門檻時合併標籤", () => {
  const cfg = {
    cvs: { fee: 80, free_threshold: 666 },
    cvsCod: { fee: 80, free_threshold: 666 },
    home: { fee: 150, free_threshold: 999 },
  }

  it("★ 寫「超商取貨滿666元免運」，不要並列成兩個方式", () => {
    expect(marqueeShippingMessages(cfg)).toEqual([
      "超商取貨滿666元免運",
      "宅配滿999元免運",
    ])
  })

  it("★ 兩種超商門檻不同時不能合併 —— 合併就是對客人講錯條件", () => {
    const split = { ...cfg, cvsCod: { fee: 80, free_threshold: 999 } }
    expect(marqueeShippingMessages(split)).toEqual([
      "超商取貨滿666元免運",
      // 取貨付款與宅配同為 999，按門檻分組本來就該並列
      "超商取貨付款、宅配滿999元免運",
    ])
  })

  it("三種都同門檻時講「全站」", () => {
    const same = {
      cvs: { fee: 80, free_threshold: 999 },
      cvsCod: { fee: 80, free_threshold: 999 },
      home: { fee: 150, free_threshold: 999 },
    }
    expect(marqueeShippingMessages(same)).toEqual(["全站消費滿999元免運"])
  })
})

/**
 * 兩家超商的免運門檻從 2026-11-17 起不同（7-11 699、全家 1200）。
 *
 * 這一段鎖的是「不能再用一句『超商取貨』講兩家」—— 全家的客人看到 699 會以為
 * 自己免運，結帳被收 80 元才發現。這正是這個檔案開頭那兩次事故的同一種錯：
 * 畫面上的數字與結帳實際算的不是同一件事。
 */
describe("7-11 與全家門檻不同", () => {
  const CHAINS: ShippingConfig = {
    cvs: { fee: 80, free_threshold: 699 },
    cvsCod: { fee: 80, free_threshold: 699 },
    cvsFamily: { fee: 80, free_threshold: 1200 },
    cvsFamilyCod: { fee: 80, free_threshold: 1200 },
    home: { fee: 150, free_threshold: 1200 },
  }

  it("★ 跑馬燈分成兩句，而且全家跟宅配合在同一句", () => {
    expect(marqueeShippingMessages(CHAINS)).toEqual([
      "7-11 超商取貨滿699元免運",
      "全家超商取貨、宅配滿1200元免運",
    ])
  })

  it("★ FAQ 講的是同一組數字", () => {
    const answer = shippingFeeAnswer(CHAINS)
    expect(answer).toContain("消費滿 NT$699 7-11 超商取貨免運")
    expect(answer).toContain("消費滿 NT$1200 全家超商取貨、宅配免運")
  })

  it("★ 購物車提示講最快的那條路，並指名是 7-11", () => {
    const h = cartFreeShippingHint(CHAINS, 650)!
    expect(h.threshold).toBe(699)
    expect(h.remaining).toBe(49)
    expect(h.methods).toBe("7-11 超商取貨")
  })

  it("★ 活動的 cvs 分組不分超商，兩家都要跟著降", () => {
    // API 的 shippingBucket() 把 7-11 與全家都算成 cvs，所以「超商取貨滿600
    // 免運」的活動兩家都吃得到。少了這層對照，全家客人會看到自己沒有的門檻。
    const h = cartFreeShippingHint(
      CHAINS,
      500,
      [{ minOrder: 600, buckets: ["cvs"], weekdays: [] }],
    )!
    expect(h.threshold).toBe(600)
    expect(h.methods).toBe("7-11 超商取貨、全家超商取貨")
  })

  it("舊版 API 還沒回全家欄位時，維持原本的「超商取貨」講法", () => {
    const legacy: ShippingConfig = {
      cvs: { fee: 80, free_threshold: 699 },
      cvsCod: { fee: 80, free_threshold: 699 },
      home: { fee: 150, free_threshold: 1200 },
    }
    expect(marqueeShippingMessages(legacy)).toEqual([
      "超商取貨滿699元免運",
      "宅配滿1200元免運",
    ])
  })
})

/**
 * 階梯運費（2026-11-26 起）：7-11 滿 699 運費 40、滿 999 免運。取貨與取貨付款
 * 都適用（店主 2026-11-26 指定），全家與宅配不適用。
 *
 * 跑馬燈把階梯與免運併成一句（「…滿699元運費40元．滿999元免運」），FAQ 則
 * 各自成句。語氣各自保留，數字同一份來源 —— 這個檔案存在的理由就是後者。
 */
const LADDER: ShippingConfig = {
  cvs: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }] },
  cvsCod: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }] },
  cvsFamily: { fee: 80, free_threshold: 1500 },
  cvsFamilyCod: { fee: 80, free_threshold: 1500 },
  home: { fee: 150, free_threshold: 1500 },
}

describe("階梯運費文案", () => {
  // 跑馬燈改成「階梯與免運併成一句」（店主 2026-11-26 最終版），詳細的斷言在
  // 下面「跑馬燈：7-11 階梯與免運併句」那一組。這裡只確認 7-11 仍然是一句。
  it("★ 跑馬燈的 7-11 是一句，含階梯與免運", () => {
    const msgs = marqueeShippingMessages(LADDER)
    expect(msgs).toEqual([
      "7-11 超商取貨滿699元運費40元．滿999元免運",
      "全家超商取貨、宅配滿1500元免運",
    ])
  })

  it("★ FAQ 要講階梯，而且不加「非取貨付款」—— 兩種付款方式都是 40", () => {
    const answer = shippingFeeAnswer(LADDER)
    expect(answer).toContain("7-11 超商取貨消費滿 NT$699 運費 NT$40")
    expect(answer).not.toContain("非取貨付款")
    expect(answer).toContain("NT$999")
  })

  it("沒有階梯時 FAQ 也不提 —— 舊版 API 沒有這個欄位也不會多一句", () => {
    expect(marqueeShippingMessages(SAME)).toEqual(["全站消費滿999元免運"])
    expect(shippingFeeAnswer(SAME)).not.toContain("運費 NT$40")
  })

  it("多階照順序講 —— 由低到高", () => {
    const two: ShippingConfig = {
      ...LADDER,
      cvs: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }, { at: 849, fee: 20 }] },
    }
    const answer = shippingFeeAnswer(two)
    expect(answer.indexOf("NT$699")).toBeLessThan(answer.indexOf("NT$849"))
  })

  it("免運門檻那句不受影響 —— 分組邏輯沒被階梯動到", () => {
    expect(freeShippingGroups(LADDER).map((g) => [g.threshold, g.labels])).toEqual([
      [999, ["7-11 超商取貨"]],
      [1500, ["全家超商取貨", "宅配"]],
    ])
  })

  it("shippingSteps 本身仍然指名 7-11 —— 階梯不是全家的", () => {
    expect(shippingSteps(LADDER)).toEqual([
      { label: "7-11 超商取貨", at: 699, fee: 40 },
    ])
  })
})

/**
 * 跑馬燈的 7-11 那一句：階梯與免運併成同一句，用「．」分隔。
 *
 *   7-11 超商取貨滿699元運費40元．滿999元免運
 *
 * 店主 2026-11-26 第三次調整。先是兩句並排，再是只留免運那句，最後決定併成
 * 一句 —— 一句講完整道階梯，客人不必在滾動的跑馬燈上自己把兩句湊起來，也不會
 * 只看到其中一半。
 *
 * 併的對象只能是「標籤剛好就是 7-11 的那一組」。門檻碰巧跟全家或宅配相同而被
 * 分到同一組時不能併 —— 那會變成對全家承諾 40 元運費。那種情形就讓階梯回去
 * 自己一句。
 */
describe("跑馬燈：7-11 階梯與免運併句", () => {
  const LIVE: ShippingConfig = {
    cvs: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }] },
    cvsCod: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }] },
    cvsFamily: { fee: 80, free_threshold: 1500 },
    cvsFamilyCod: { fee: 80, free_threshold: 1500 },
    home: { fee: 150, free_threshold: 1500 },
  }

  it("★ 併成一句，用「．」分隔", () => {
    expect(marqueeShippingMessages(LIVE)).toEqual([
      "7-11 超商取貨滿699元運費40元．滿999元免運",
      "全家超商取貨、宅配滿1500元免運",
    ])
  })

  it("★ 多階也併進同一句 —— 由低到高，免運在最後", () => {
    const two: ShippingConfig = {
      ...LIVE,
      cvs: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }, { at: 849, fee: 20 }] },
    }
    expect(marqueeShippingMessages(two)[0]).toBe(
      "7-11 超商取貨滿699元運費40元．滿849元運費20元．滿999元免運",
    )
  })

  it("★ 門檻跟全家相同而被分到同一組時不能併 —— 那會變成對全家承諾 40", () => {
    const sameThreshold: ShippingConfig = {
      cvs: { fee: 80, free_threshold: 1500, steps: [{ at: 699, fee: 40 }] },
      cvsCod: { fee: 80, free_threshold: 1500, steps: [{ at: 699, fee: 40 }] },
      cvsFamily: { fee: 80, free_threshold: 1500 },
      cvsFamilyCod: { fee: 80, free_threshold: 1500 },
      home: { fee: 150, free_threshold: 1500 },
    }
    const msgs = marqueeShippingMessages(sameThreshold)
    // 階梯自己一句，免運那句照原樣講「全站」或並列
    expect(msgs[0]).toBe("7-11 超商取貨滿699元運費40元")
    expect(msgs.some((m) => m.includes("1500") && !m.includes("運費40元"))).toBe(true)
    // 絕對不能出現「全家…運費40元」這種句子
    expect(msgs.join("")).not.toMatch(/全家[^．]*運費40元/)
  })

  it("沒有階梯時就是原本的免運句，不多也不少", () => {
    expect(marqueeShippingMessages(SAME)).toEqual(["全站消費滿999元免運"])
  })

  it("拿不到設定時不產生任何句子", () => {
    expect(marqueeShippingMessages(null)).toEqual([])
  })

  it("FAQ 不受影響 —— 它仍然是各自成句的完整說明", () => {
    const answer = shippingFeeAnswer(LIVE)
    expect(answer).toContain("7-11 超商取貨消費滿 NT$699 運費 NT$40。")
    expect(answer).toContain("消費滿 NT$999 7-11 超商取貨免運。")
  })
})
