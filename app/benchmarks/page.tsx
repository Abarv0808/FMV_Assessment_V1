import { Suspense } from "react"
import { BenchmarksContent } from "@/components/pages/benchmarks-content"
import { AppShell } from "@/components/app-shell"

function BenchmarksLoading() {
  return (
    <div className="p-8">
      <div className="h-8 w-48 bg-muted animate-pulse rounded mb-2" />
      <div className="h-4 w-64 bg-muted animate-pulse rounded mb-8" />
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded" />
        ))}
      </div>
    </div>
  )
}

export default function BenchmarksPage() {
  return (
    <AppShell>
      <Suspense fallback={<BenchmarksLoading />}>
        <BenchmarksContent />
      </Suspense>
    </AppShell>
  )
}
