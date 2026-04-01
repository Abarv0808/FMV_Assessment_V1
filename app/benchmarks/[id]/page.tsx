import { Suspense } from "react"
import { BenchmarkDetailContent } from "@/components/pages/benchmark-detail-content"
import { Skeleton } from "@/components/ui/skeleton"

function BenchmarkDetailSkeleton() {
  return (
    <div className="p-8">
      <Skeleton className="h-8 w-64 mb-2" />
      <Skeleton className="h-4 w-96 mb-8" />
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}

export default async function BenchmarkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <Suspense fallback={<BenchmarkDetailSkeleton />}>
      <BenchmarkDetailContent benchmarkId={id} />
    </Suspense>
  )
}
