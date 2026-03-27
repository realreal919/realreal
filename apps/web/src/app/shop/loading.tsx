export default function ShopLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="h-8 bg-zinc-200 rounded w-32 mb-6 animate-pulse" />
      <div className="flex gap-2 mb-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-8 w-16 bg-zinc-200 rounded animate-pulse" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square bg-zinc-200 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  )
}
