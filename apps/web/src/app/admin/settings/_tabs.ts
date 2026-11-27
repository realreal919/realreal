import type { AdminTab } from "../_components/AdminTabs"

/**
 * 設定區的分頁清單。四個頁面以前各自複製一份，加一個分頁要改四個檔，
 * 漏掉一個就會有頁面少一個分頁 —— 所以集中在這裡。
 */
export const SETTINGS_TABS: AdminTab[] = [
  { href: "/admin/settings", label: "系統參數" },
  { href: "/admin/settings/team", label: "團隊成員" },
  { href: "/admin/settings/email-templates", label: "Email 模板" },
  { href: "/admin/settings/hero", label: "首頁主視覺" },
  { href: "/admin/settings/carousel", label: "顧客回饋輪播" },
]
