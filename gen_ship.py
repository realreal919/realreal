# -*- coding: utf-8 -*-
"""以使用者修訂後的出貨單為範本，依收貨方式分檔產生。

範本結構（711出貨單_已付款_廠商代出_0831.docx）：
  [0] 訂單資訊表  [1] 空段  [2] 明細表  [3] 空段  [4..] 置中頁尾
每筆訂單重複整個區塊，訂單之間插入分頁符，讓每張出貨單各自一頁。
"""
import copy, json, collections, re, docx
from docx.table import Table
from docx.oxml.ns import qn

TEMPLATE = "C:/Users/rober/Desktop/出貨/出貨單範本_0921.docx"   # 最新版文案（9/21 改怎麼喝／怎麼泡）

# 展開後的內部品名 → 出貨單上顯示的名稱
DISPLAY = {
    "原味蛋白粉50": "初心原味 – 50G隨身包", "可可蛋白粉50": "可可 – 50G隨身包",
    "草莓蛋白粉50": "果真草莓 – 50G隨身包", "杏仁蛋白粉50": "杏仁火龍果 – 50G隨身包",
    "芝麻蛋白粉50": "芝麻藍莓 – 50G隨身包", "銀杏蛋白粉50": "銀杏水蜜桃 – 50G隨身包",
    "原味蛋白粉300": "初心原味 – 300克夾鏈袋", "可可蛋白粉300": "可可 – 300克夾鏈袋",
    "草莓蛋白粉300": "果真草莓 – 300克夾鏈袋", "杏仁蛋白粉300": "杏仁火龍果 – 300克夾鏈袋",
    "芝麻蛋白粉300": "芝麻藍莓 – 300克夾鏈袋", "銀杏蛋白粉300": "銀杏水蜜桃 – 300克夾鏈袋",
    "哈密瓜x草莓x蘋果": "三果日麗（草莓/蘋果/哈密瓜）", "無花果": "單果日常（無花果）",
    "草莓x哈密瓜": "雙果日和（草莓/哈密瓜）", "水蜜桃x蘋果": "雙果日和（水蜜桃/蘋果）",
    "草莓x蘋果": "雙果日和（草莓/蘋果）", "無花果x蘋果": "雙果日和（無花果/蘋果）",
    "帆布袋大": "誠真生活帆布環保袋（大）", "帆布袋小": "誠真生活帆布環保袋（小）",
}
SHIP_LABEL = {"cvs_711": "7-11", "cvs_family": "全家",
              "home_delivery": "宅配", "overseas_cod": "順豐（到付）"}


def set_cell(cell, text):
    p = cell.paragraphs[0]
    if p.runs:
        p.runs[0].text = text
        for r in p.runs[1:]:
            r.text = ""
    else:
        p.add_run(text)


def addr_line(a, ship):
    if a is None:
        return ""
    if ship in ("cvs_711", "cvs_family"):
        chain = "全家" if a.get("cvs_type") == "family" else "7-11"
        return f'{chain} {a.get("address") or ""} ({a.get("cvs_store_id") or ""})'.strip()
    # 客人常常在地址欄裡又打了一次縣市（#10000195 就填了「台北市清江路25巷5號」，
    # 而縣市欄本來就是台北市），直接串起來會變成「台北市 台北市清江路…」。
    # 只在地址真的以縣市開頭時才去掉那一段，其餘一字不動。
    city = a.get("city") or ""
    addr = a.get("address") or ""
    if city and addr.startswith(city):
        addr = addr[len(city):].lstrip()
    # 行政區重複（#10000215 的「大里區大里區永東街6號4樓」）。結帳頁把選單選的
    # 行政區串到地址前面，客人自己又打了一次，就會變成這樣。只收掉「緊接著重複
    # 一次」的情形，不去猜其他寫法。
    m = re.match(r"^(.{1,3}[區鄉鎮市])", addr)
    if m and addr.startswith(m.group(1) * 2):
        addr = addr[len(m.group(1)):]
    return " ".join(x for x in [a.get("postal_code"), city, addr] if x)


def build(out_path, orders):
    doc = docx.Document(TEMPLATE)
    body = doc.element.body
    kids = list(body)
    tbl0 = copy.deepcopy(kids[0])            # 訂單資訊表
    gap1 = copy.deepcopy(kids[1])
    tbl1 = copy.deepcopy(kids[2])            # 明細表
    footer = [copy.deepcopy(c) for c in kids[3:-1]]   # 空段 + 置中頁尾
    sect = kids[-1]
    for c in kids[:-1]:
        body.remove(c)

    for idx, o in enumerate(orders):
        el0 = copy.deepcopy(tbl0); sect.addprevious(el0)
        t0 = Table(el0, doc)
        for cell, val in zip(t0.rows[1].cells,
                             [o["order"], o["date"], o["name"], o["phone"], o["addr"], o["ship_label"]]):
            set_cell(cell, val)

        sect.addprevious(copy.deepcopy(gap1))

        # 貨到付款：門市／司機要向取件人收款，沒有這行就會漏收。
        # 放在訂單資訊表正下方、明細之前，是整張單最醒目的位置。
        if o.get("cod_amount"):
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from docx.shared import Pt, RGBColor
            cp = doc.add_paragraph()
            cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = cp.add_run(f"【貨到付款】請向取件人收取　NT$ {o['cod_amount']:,}")
            run.bold = True
            run.font.size = Pt(14)
            run.font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
            sect.addprevious(cp._p)
            sect.addprevious(copy.deepcopy(gap1))

        el1 = copy.deepcopy(tbl1); sect.addprevious(el1)
        t1 = Table(el1, doc)
        for extra in list(t1.rows[2:]):      # 只留標題列 + 一列樣板
            extra._tr.getparent().remove(extra._tr)
        proto = t1.rows[1]._tr
        for _ in range(len(o["items"]) - 1):
            new = copy.deepcopy(proto); proto.addnext(new); proto = new
        for row, (nm, qty) in zip(t1.rows[1:], o["items"]):
            set_cell(row.cells[0], nm)
            set_cell(row.cells[1], str(qty))

        for f in footer:
            sect.addprevious(copy.deepcopy(f))

        if idx < len(orders) - 1:            # 每張出貨單各自一頁
            p = doc.add_paragraph()
            r = p.add_run()
            br = r._r.makeelement(qn("w:br"), {qn("w:type"): "page"})
            r._r.append(br)
            sect.addprevious(p._p)

    doc.save(out_path)
    print(f"  {out_path.split('/')[-1]}  {len(orders)} 筆")


def gift_label(key):
    """贈品在出貨單上的標註。

    量匙是首購禮（第一次買夾鏈袋就送），不是滿額贈。兩種混在一起標成「滿額贈」，
    裝箱的人會以為是湊到金額才有的，客訴時也查不出為什麼這筆有、那筆沒有。
    """
    name = DISPLAY.get(key, key)
    if "量匙" in name:
        return name + "（首購禮）"
    return name + "（滿額贈）"


def run(batch_file, expanded_file, name_map, out_dir="C:/Users/rober/Desktop/出貨", skip=()):
  exp = {r["order"]: r for r in json.load(open(expanded_file, encoding="utf-8"))}
  src = json.load(open(batch_file, encoding="utf-8"))
  groups = collections.defaultdict(list)
  for r in src:
      e = exp[r["order"]]
      a = r["addr"] or {}
      groups[r["ship"]].append({
          "order": r["order"], "date": r["date"],
          "name": a.get("name", ""), "phone": a.get("phone", ""),
          "addr": addr_line(r["addr"], r["ship"]),
          "ship_label": SHIP_LABEL.get(r["ship"], r["ship"]),
          # 滿額贈的品項另外列，名稱後面標「（滿額贈）」—— 併進 counts 的話，
          # 撿貨的人看到「初心原味 1」會以為是客人買的，少放或多放都查不出來。
          # 贈品口味和客人買的一樣時（#10000290 買草莓、贈原味）也要分開兩列。
          "items": [(DISPLAY.get(k, k), v) for k, v in sorted(e["counts"].items())]
                   + [(gift_label(k), v) for k, v in sorted(e.get("gifts", {}).items())],
          "cod_amount": int(r["total"]) if r["pay"] == "cvs_cod" else None,
      })

  for ship, orders in groups.items():
      if ship in skip:
          print(f"  (跳過 {name_map[ship]} — 檔案使用中)")
          continue
      orders.sort(key=lambda x: x["order"])
      build(f"{out_dir}/{name_map[ship]}.docx", orders)


if __name__ == "__main__":
    import sys
    run("scratch_ship_batch.json", "ship_expanded.json",
        {"cvs_711": "711出貨單_0901", "cvs_family": "全家出貨單_0901",
         "home_delivery": "宅配出貨單_0901", "overseas_cod": "港澳出貨單_0901"},
        skip=set(sys.argv[1:]))
