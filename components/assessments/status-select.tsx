"use client"

import type { AssessmentStatus } from "@/lib/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const statusOptions: { value: AssessmentStatus; label: string; dotColor: string }[] = [
  { value: "IN_REVIEW", label: "In Review", dotColor: "bg-primary" },
  { value: "APPROVED", label: "Approved", dotColor: "bg-emerald-600" },
  { value: "MANUAL_ASSESSMENT", label: "Manual Assessment", dotColor: "bg-muted-foreground" },
]

interface StatusSelectProps {
  value: AssessmentStatus
  onValueChange: (value: AssessmentStatus) => void
  /** Compact mode uses a smaller trigger (useful inside table rows / cards) */
  compact?: boolean
}

export function StatusSelect({ value, onValueChange, compact = false }: StatusSelectProps) {
  const current = statusOptions.find((o) => o.value === value) ?? statusOptions[0]

  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as AssessmentStatus)}
    >
      <SelectTrigger
        className={cn(
          "border-border/40 bg-transparent focus:ring-1 focus:ring-ring",
          compact ? "h-7 text-xs px-2 w-auto min-w-[140px]" : "h-8 text-sm px-3 w-auto min-w-[170px]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue>
          <span className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full shrink-0", current.dotColor)} />
            {current.label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {statusOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full shrink-0", opt.dotColor)} />
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
