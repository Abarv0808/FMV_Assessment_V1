import { Suspense } from "react"
import { AssessmentDetailContent } from "@/components/pages/assessment-detail-content"

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <AssessmentDetailContent id={id} />
    </Suspense>
  )
}
