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
 * 階梯運費（2026-11-26 起）：7-11 取貨滿 699 運費 40、滿 999 免運。
 *
 * 這一段跟免運門檻一樣會被講在兩個畫面（跑馬燈、FAQ），所以照這個檔案的規矩
 * 只能有一份來源。鎖三件事：
 *   1. 兩個畫面講的是同一組數字
 *   2. 階梯自己一句，不要黏在免運那句後面 —— 黏在一起客人會以為 699 就免運
 *   3. **一定指名 7-11**。階梯只有 7-11 取貨有，而既有的標籤邏輯在兩家超商
 *      門檻相同時會把標籤合併成「超商取貨」；階梯若跟著合併，就是對全家的
 *      客人承諾一個他沒有的運費。
 */
const LADDER: ShippingConfig = {
  cvs: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }] },
  cvsCod: { fee: 80, free_threshold: 899 },
  cvsFamily: { fee: 80, free_threshold: 1500 },
  cvsFamilyCod: { fee: 80, free_threshold: 1500 },
  home: { fee: 150, free_threshold: 1500 },
}

describe("階梯運費文案", () => {
  it("★ 跑馬燈：階梯自己一句，排在免運那句前面", () => {
    const msgs = marqueeShippingMessages(LADDER)
    expect(msgs[0]).toBe("7-11 超商取貨滿699元運費40元")
    expect(msgs).toContain("7-11 超商取貨滿999元免運")
  })

  it("★ FAQ 講的是同一組數字", () => {
    const answer = shippingFeeAnswer(LADDER)
    expect(answer).toContain("7-11 超商取貨消費滿 NT$699 運費 NT$40")
    expect(answer).toContain("NT$999")
  })

  it("★ 兩家超商門檻相同時也要指名 7-11 —— 階梯不是全家的", () => {
    const bothSame: ShippingConfig = {
      cvs: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }] },
      cvsCod: { fee: 80, free_threshold: 999 },
      cvsFamily: { fee: 80, free_threshold: 999 },
      cvsFamilyCod: { fee: 80, free_threshold: 999 },
      home: { fee: 150, free_threshold: 999 },
    }
    const msgs = marqueeShippingMessages(bothSame)
    // 免運那句會合併成「全站」，但階梯那句必須還是只講 7-11。
    // 這組設定裡取貨付款也是同門檻，所以還會多一個「非取貨付款」的註記
    // （見下面那個 describe）—— 重點是它指名了 7-11，沒有變成「全站」。
    expect(msgs[0]).toBe("7-11 超商取貨(非取貨付款)滿699元運費40元")
    expect(msgs[0]).not.toContain("全站")
    expect(msgs[0]).toContain("7-11")
    expect(shippingFeeAnswer(bothSame)).toContain("7-11 超商取貨(非取貨付款)消費滿 NT$699")
  })

  it("沒有階梯時完全不提 —— 舊版 API 沒有這個欄位也不會多一句", () => {
    expect(marqueeShippingMessages(SAME)).toEqual(["全站消費滿999元免運"])
    expect(shippingFeeAnswer(SAME)).not.toContain("運費 NT$40")
  })

  it("多階也照順序講 —— 由低到高", () => {
    const two: ShippingConfig = {
      ...LADDER,
      cvs: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }, { at: 849, fee: 20 }] },
    }
    const msgs = marqueeShippingMessages(two)
    expect(msgs.slice(0, 2)).toEqual([
      "7-11 超商取貨滿699元運費40元",
      "7-11 超商取貨滿849元運費20元",
    ])
  })

  it("免運門檻那句不受影響 —— 分組邏輯沒被階梯動到", () => {
    expect(freeShippingGroups(LADDER).map((g) => [g.threshold, g.labels])).toEqual([
      [999, ["7-11 超商取貨"]],
      [899, ["7-11 超商取貨付款"]],
      [1500, ["全家超商取貨", "宅配"]],
    ])
  })
})

/**
 * 線上實況（2026-11-26）：7-11 的取貨與取貨付款免運門檻都是 999，所以免運那句
 * 會合併成「7-11 超商取貨滿999元免運」——「取貨付款」被收進同一句裡。
 *
 * 階梯卻只有取貨有（代收貨款有額外成本，而且 API 只在非取貨付款的分支讀階梯
 * 設定）。這時候階梯那句若也只寫「7-11 超商取貨」，在同一條跑馬燈上就會被讀成
 * 「連取貨付款也只要 40」—— 選了取貨付款的客人結帳被收 80 才發現。
 *
 * 所以：兩者門檻相同（會被合併）時，階梯那句要明講「非取貨付款」。
 */
describe("階梯 vs 取貨付款的混淆", () => {
  const BOTH_999: ShippingConfig = {
    cvs: { fee: 80, free_threshold: 999, steps: [{ at: 699, fee: 40 }] },
    cvsCod: { fee: 80, free_threshold: 999 },
    cvsFamily: { fee: 80, free_threshold: 1500 },
    cvsFamilyCod: { fee: 80, free_threshold: 1500 },
    home: { fee: 150, free_threshold: 1500 },
  }

  it("★ 取貨付款同門檻被合併時，階梯要註明「非取貨付款」", () => {
    const msgs = marqueeShippingMessages(BOTH_999)
    expect(msgs[0]).toBe("7-11 超商取貨(非取貨付款)滿699元運費40元")
    // 免運那句照舊合併 —— 那是對的，兩者真的都是 999
    expect(msgs).toContain("7-11 超商取貨滿999元免運")
    expect(shippingFeeAnswer(BOTH_999)).toContain("7-11 超商取貨(非取貨付款)消費滿 NT$699")
  })

  it("取貨付款門檻不同、本來就各自一句時，不必加註記", () => {
    const split: ShippingConfig = {
      ...BOTH_999,
      cvsCod: { fee: 80, free_threshold: 899 },
    }
    const msgs = marqueeShippingMessages(split)
    expect(msgs[0]).toBe("7-11 超商取貨滿699元運費40元")
    expect(msgs).toContain("7-11 超商取貨付款滿899元免運")
  })

  it("取貨付款不提供免運（0）時也不必加註記 —— 它不會被合併進來", () => {
    const noCod: ShippingConfig = {
      ...BOTH_999,
      cvsCod: { fee: 80, free_threshold: 0 },
    }
    expect(marqueeShippingMessages(noCod)[0]).toBe("7-11 超商取貨滿699元運費40元")
  })
})
