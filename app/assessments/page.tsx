import { Suspense } from "react"
import { AssessmentsContent } from "@/components/pages/assessments-content"

export default function AssessmentsPage() {
  return (
    <Suspense fallback={null}>
      <AssessmentsContent />
    </Suspense>
  )
}
