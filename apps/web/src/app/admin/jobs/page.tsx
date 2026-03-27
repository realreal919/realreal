export const metadata = { title: "工作佇列 | Admin" }

export default function AdminJobsPage() {
  const apiUrl = process.env.RAILWAY_API_URL ?? "http://localhost:4000"

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">背景任務監控</h1>
      <p className="text-sm text-zinc-500">
        透過 Bull Board 監控 BullMQ 佇列狀態。可查看排隊中、進行中、失敗的任務，並手動重試或清除。
      </p>
      <div className="border rounded-lg overflow-hidden" style={{ height: "calc(100vh - 200px)" }}>
        <iframe
          src={`${apiUrl}/admin/bull-board`}
          className="w-full h-full"
          title="BullMQ Job Monitor"
        />
      </div>
    </div>
  )
}
