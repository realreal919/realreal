export default function BlogLoading() {
  return (
    <div className="min-h-screen">
      {/* Header skeleton */}
      <section className="bg-gradient-to-br from-[#f5f0fa] via-[#f8f4f0] to-[#faf6f2] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="mx-auto h-9 w-48 animate-pulse rounded-lg bg-[#10305a]/10" />
          <div className="mx-auto mt-4 h-5 w-80 max-w-full animate-pulse rounded-lg bg-[#10305a]/5" />
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Filter tabs skeleton */}
        <div className="mb-10 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-20 animate-pulse rounded-full bg-[#10305a]/5"
            />
          ))}
        </div>

        {/* Cards grid skeleton */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg bg-white shadow-sm"
            >
              <div className="aspect-[16/9] animate-pulse bg-zinc-100" />
              <div className="p-5 space-y-3">
                <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-100" />
                <div className="h-4 w-full animate-pulse rounded bg-zinc-50" />
                <div className="h-3 w-24 animate-pulse rounded bg-zinc-50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
