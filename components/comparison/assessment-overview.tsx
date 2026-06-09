"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Assessment, AssessmentStatus, DataSource } from "@/lib/types"
import { AlertCircle, Briefcase, CheckCircle2, ChevronRight, Clock, Database, Pencil } from "lucide-react"
import { StatusSelect } from "@/components/assessments/status-select"

interface AssessmentOverviewProps {
  assessment: Assessment
  onStatusChange?: (id: string, status: AssessmentStatus) => void
  onDataSourceChange?: (id: string, dataSource: DataSource) => void
}

export function AssessmentOverview({ assessment, onStatusChange, onDataSourceChange }: AssessmentOverviewProps) {
  const [isEditingDataSource, setIsEditingDataSource] = useState(false)
  const [pendingDataSource, setPendingDataSource] = useState<DataSource | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleDataSourceSelect = (value: DataSource) => {
    if (value !== assessment.dataSource) {
      setPendingDataSource(value)
      setShowConfirm(true)
    } else {
      setIsEditingDataSource(false)
    }
  }

  const handleConfirm = () => {
    if (pendingDataSource) {
      onDataSourceChange?.(assessment.id, pendingDataSource)
    }
    setShowConfirm(false)
    setPendingDataSource(null)
    setIsEditingDataSource(false)
  }

  const handleCancel = () => {
    setShowConfirm(false)
    setPendingDataSource(null)
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-border/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Status</p>
                <StatusSelect
                  value={assessment.status}
                  onValueChange={(s) => onStatusChange?.(assessment.id, s)}
                />
              </div>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground mb-2">Data Source</p>
                {isEditingDataSource ? (
                  <Select
                    value={assessment.dataSource ?? undefined}
                    onValueChange={(v) => handleDataSourceSelect(v as DataSource)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IQVIA GrantPlan">IQVIA GrantPlan</SelectItem>
                      <SelectItem value="IQVIA GPI">IQVIA GPI</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm truncate">{assessment.dataSource ?? "Not set"}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setIsEditingDataSource(true)}
                    >
                      <Pencil className="h-3 w-3" />
                      <span className="sr-only">Edit data source</span>
                    </Button>
                  </div>
                )}
                <DataSourceHierarchy
                  source={assessment.dataSource}
                  hierarchy={assessment.dataSourceHierarchy}
                />
              </div>
              <Database className="h-5 w-5 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Business Unit</p>
                <p className="font-medium text-sm">{assessment.businessUnit ?? "Not set"}</p>
              </div>
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-semibold mt-1">{assessment.proposalCount}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Flagged Items</p>
                <p className="text-2xl font-semibold mt-1 text-red-500">{assessment.flaggedCount}</p>
              </div>
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Assigned To</p>
              <p className="font-medium mt-1">{assessment.assignedTo || "Unassigned"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Data Source?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the Data Source may update benchmark values and variance calculations for this assessment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface DataSourceHierarchyData {
  indications?: string[]
  phases?: string[]
  countries?: string[]
}

// Renders the benchmark data-source hierarchy as a breadcrumb:
//   Source -> Indication -> Phase -> Country
// When a segment has multiple values it collapses to "First +N" with the full
// list shown in a tooltip.
function DataSourceHierarchy({
  source,
  hierarchy,
}: {
  source?: DataSource | null
  hierarchy?: DataSourceHierarchyData
}) {
  const indications = hierarchy?.indications ?? []
  const phases = hierarchy?.phases ?? []
  const countries = hierarchy?.countries ?? []

  // Nothing to show beyond the source itself.
  if (indications.length === 0 && phases.length === 0 && countries.length === 0) {
    return null
  }

  const segments: { key: string; values: string[] }[] = [
    { key: "source", values: source ? [source] : [] },
    { key: "indication", values: indications },
    { key: "phase", values: phases },
    { key: "country", values: countries },
  ].filter((s) => s.values.length > 0)

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
        {segments.map((segment, idx) => (
          <div key={segment.key} className="flex items-center gap-x-1">
            {idx > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
            <HierarchySegment values={segment.values} />
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}

function HierarchySegment({ values }: { values: string[] }) {
  const first = values[0]
  const extra = values.length - 1

  const label = (
    <span className="text-xs text-muted-foreground">
      {first}
      {extra > 0 && <span className="ml-1 font-medium text-foreground">{`+${extra}`}</span>}
    </span>
  )

  if (extra <= 0) {
    return label
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-default">
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ul className="text-xs">
          {values.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
