"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { Assessment, AssessmentStatus } from "@/lib/types"
import { AlertCircle, Calendar, User } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useRouter } from "next/navigation"
import { StatusSelect } from "@/components/assessments/status-select"

interface AssessmentCardProps {
  assessment: Assessment
  onStatusChange?: (id: string, status: AssessmentStatus) => void
}

export function AssessmentCard({ assessment, onStatusChange }: AssessmentCardProps) {
  const router = useRouter()

  return (
    <Card
      className="border-border/40 hover:border-primary/50 transition-colors cursor-pointer group"
      onClick={() => router.push(`/assessments/${assessment.id}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold group-hover:text-primary transition-colors">{assessment.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{assessment.studyTrackingNumber}</p>
          </div>
          <StatusSelect
            value={assessment.status}
            onValueChange={(s) => onStatusChange?.(assessment.id, s)}
            compact
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-muted-foreground">Total Items</p>
            <p className="font-medium mt-1">{assessment.proposalCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Flagged</p>
            <div className="flex items-center gap-1 mt-1">
              {assessment.flaggedCount > 0 ? (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="font-medium text-red-500">{assessment.flaggedCount}</span>
                </>
              ) : (
                <span className="font-medium text-muted-foreground">0</span>
              )}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-border/40 space-y-2">
          {assessment.assignedTo && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{assessment.assignedTo}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Updated {formatDistanceToNow(new Date(assessment.updatedAt), { addSuffix: true })}</span>
          </div>
        </div>

        <Button variant="outline" className="w-full bg-transparent" size="sm">
          View Details
        </Button>
      </CardContent>
    </Card>
  )
}
