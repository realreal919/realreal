/**
 * 行銷區的分頁清單，只有這一份。
 *
 * 原本八個頁面各自寫一份一模一樣的陣列 —— 新增一個分頁要改八個檔案，漏掉一個
 * 就變成「從 A 頁進去看得到、從 B 頁進去看不到」。2026-11-17 加「到貨通知」時
 * 收成一份。
 */
export const MARKETING_TABS = [
  { href: "/admin/campaigns", label: "行銷活動" },
  { href: "/admin/coupons", label: "優惠券" },
  { href: "/admin/marketing/tiers", label: "會員等級" },
  { href: "/admin/marketing/points", label: "點數規則" },
  { href: "/admin/marketing/share-reports", label: "分享回報" },
  { href: "/admin/marketing/recall", label: "召回名單" },
  { href: "/admin/marketing/restock", label: "到貨通知" },
  { href: "/admin/marketing/broadcast", label: "寄信給客人" },
]
