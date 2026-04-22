"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { THERAPEUTIC_AREAS, SECURITY_GROUPS, type TherapeuticArea, type SecurityGroup } from "@/lib/types"

interface AssessmentInfoStepProps {
  data: {
    name: string
    studyTrackingNumber: string
    protocolNumber: string
    therapeuticArea: TherapeuticArea | ""
    businessUnit: SecurityGroup | ""
    description: string
    targetDate: Date | undefined
  }
  onChange: (data: Partial<AssessmentInfoStepProps["data"]>) => void
  showErrors?: boolean
}

export function AssessmentInfoStep({ data, onChange, showErrors }: AssessmentInfoStepProps) {
  // Therapeutic area is now optional, no error check needed
  const businessUnitError = showErrors && !data.businessUnit
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Assessment Name *</Label>
        <Input
          id="name"
          placeholder="Q1 2024 IT Services Assessment"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          required
        />
        <p className="text-xs text-muted-foreground">Give your assessment a descriptive name</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="studyTrackingNumber">{"Study tracking#"}</Label>
        <Input
          id="studyTrackingNumber"
          placeholder="Enter Study tracking#"
          value={data.studyTrackingNumber}
          onChange={(e) => onChange({ studyTrackingNumber: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">The study tracking number for this assessment</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="protocolNumber">Protocol Number (Optional)</Label>
        <Input
          id="protocolNumber"
          placeholder="Enter protocol number"
          value={data.protocolNumber}
          onChange={(e) => onChange({ protocolNumber: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">The protocol number associated with this study</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="therapeuticArea">Therapeutic Area (Optional)</Label>
        <Select
          value={data.therapeuticArea || undefined}
          onValueChange={(val) => onChange({ therapeuticArea: val as TherapeuticArea })}
        >
          <SelectTrigger
            id="therapeuticArea"
            className={cn(
              !data.therapeuticArea && "text-muted-foreground"
            )}
          >
            <SelectValue placeholder="Select Therapeutic Area" />
          </SelectTrigger>
          <SelectContent>
            {THERAPEUTIC_AREAS.map((area) => (
              <SelectItem key={area} value={area}>
                {area}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Select the therapeutic area for this study</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessUnit">Business Unit *</Label>
        <Select
          value={data.businessUnit || undefined}
          onValueChange={(val) => onChange({ businessUnit: val as SecurityGroup })}
        >
          <SelectTrigger
            id="businessUnit"
            className={cn(
              !data.businessUnit && "text-muted-foreground",
              businessUnitError && "border-red-500 focus:ring-red-500"
            )}
          >
            <SelectValue placeholder="Select Business Unit" />
          </SelectTrigger>
          <SelectContent>
            {SECURITY_GROUPS.map((group) => (
              <SelectItem key={group} value={group}>
                {group}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {businessUnitError ? (
          <p className="text-xs text-red-500">Business Unit is required.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Select the business unit for this assessment</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Additional information (Optional)</Label>
        <Textarea
          id="description"
          placeholder="Brief additional information about the assessment scope and objectives..."
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">Any additional information about this assessment</p>
      </div>

      <div className="space-y-2">
        <Label>Target Completion Date (Optional)</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-full justify-start text-left font-normal", !data.targetDate && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {data.targetDate ? format(data.targetDate, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={data.targetDate} onSelect={(date) => onChange({ targetDate: date })} />
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">When do you need this assessment completed?</p>
      </div>
    </div>
  )
}
