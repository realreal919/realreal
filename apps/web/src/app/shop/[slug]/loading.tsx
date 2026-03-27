export default function ProductLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="aspect-square bg-zinc-200 rounded-lg animate-pulse" />
        <div className="space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-3/4 animate-pulse" />
          <div className="h-6 bg-zinc-200 rounded w-1/3 animate-pulse" />
          <div className="h-24 bg-zinc-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}
