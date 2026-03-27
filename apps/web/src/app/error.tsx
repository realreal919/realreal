"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold text-zinc-800">發生錯誤</h1>
      <p className="mt-4 text-zinc-600">很抱歉，載入頁面時發生了問題。</p>
      {error.digest && (
        <p className="mt-2 text-xs text-zinc-400">錯誤代碼：{error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-8 rounded-md bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        重新載入
      </button>
    </div>
  )
}
