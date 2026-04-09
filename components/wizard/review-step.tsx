"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { Calendar, Building2, Briefcase, FileText, FileSpreadsheet, Database, Stethoscope } from "lucide-react"
import { mockBenchmarkFiles } from "@/lib/mock-data"

interface ReviewStepProps {
  data: {
    name: string
    studyTrackingNumber: string
    protocolNumber: string
    therapeuticArea: string
    businessUnit: string
    description: string
    targetDate: Date | undefined
    vendorProposal: File | null
    benchmarkFile: File | null
    benchmarkSource: "grantplan" | "grantsmanager" | null
    selectedBenchmarkFileId: string | null
  }
}

export function ReviewStep({ data }: ReviewStepProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/40">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Assessment Name</p>
              <p className="font-medium mt-1">{data.name}</p>
            </div>
          </div>

          <Separator />

          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{"Study tracking#"}</p>
              <p className="font-medium mt-1">{data.studyTrackingNumber || "—"}</p>
            </div>
          </div>

          <Separator />

          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Protocol Number</p>
              <p className="font-medium mt-1">{data.protocolNumber || "—"}</p>
            </div>
          </div>

          <Separator />

          <div className="flex items-start gap-3">
            <Stethoscope className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Therapeutic Area</p>
              <p className="font-medium mt-1">{data.therapeuticArea || "—"}</p>
            </div>
          </div>

          <Separator />

          <div className="flex items-start gap-3">
            <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Business Unit</p>
              <p className="font-medium mt-1">{data.businessUnit || "—"}</p>
            </div>
          </div>

          {data.description && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <div className="flex-1 pl-8">
                  <p className="text-sm text-muted-foreground">Additional information</p>
                  <p className="text-sm mt-1">{data.description}</p>
                </div>
              </div>
            </>
          )}

          {data.targetDate && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Target Date</p>
                  <p className="font-medium mt-1">{format(data.targetDate, "PPP")}</p>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="flex items-start gap-3">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Site Proposal</p>
              {data.vendorProposal && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">{data.vendorProposal.name}</Badge>
                  <span className="text-xs text-muted-foreground">{formatFileSize(data.vendorProposal.size)}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Benchmark Data</p>
              {data.benchmarkSource && (
                <p className="text-sm mt-1">
                  Source: {data.benchmarkSource === "grantplan" ? "IQVIA GrantPlan" : "IQVIA GPI"}
                </p>
              )}
              {data.selectedBenchmarkFileId && (() => {
                const bf = mockBenchmarkFiles.find((f) => f.id === data.selectedBenchmarkFileId)
                return bf ? (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{bf.fileName}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {bf.country} &middot; {bf.indication} &middot; {bf.trialPhase} &middot; {bf.procedureCount} procedures
                    </p>
                  </div>
                ) : null
              })()}
              {data.benchmarkFile && !data.selectedBenchmarkFileId && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{data.benchmarkFile.name}</Badge>
                    <span className="text-xs text-muted-foreground">{formatFileSize(data.benchmarkFile.size)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-accent/50 border border-border/40 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          After creating this assessment, the system will process the uploaded files and begin benchmark comparison.
          You'll be able to review flagged items and add exceptions as needed.
        </p>
      </div>
    </div>
  )
}
