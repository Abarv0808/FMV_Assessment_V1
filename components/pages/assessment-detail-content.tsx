"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
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
  ArrowLeft,
  Search,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  HelpCircle,
  ArchiveX,
  RotateCcw,
} from "lucide-react"
import {
  mockAssessments,
  mockAssessmentComparisons,
  mockAssessmentLineItems,
} from "@/lib/mock-data"
import { ComparisonTable } from "@/components/comparison/comparison-table"
import { AssessmentOverview } from "@/components/comparison/assessment-overview"
import type { Assessment, AssessmentComparison, AssessmentStatus, AuditEvent, BenchmarkType, DataSource, ItemDecision } from "@/lib/types"
import { useAuth } from "@/lib/auth-context"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface AssessmentDetailContentProps {
  id: string
}

const statusLabels: Record<AssessmentStatus, string> = {
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  MANUAL_ASSESSMENT: "Manual Assessment",
  ARCHIVED: "Archived",
}

export function AssessmentDetailContent({ id }: AssessmentDetailContentProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [flagFilter, setFlagFilter] = useState<"ALL" | "RED" | "YELLOW" | "GREEN" | "NO_MATCH">("ALL")
  const [siteFilter, setSiteFilter] = useState<string>("ALL")
  const [decisionFilter, setDecisionFilter] = useState<string>("ALL")
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRealAssessment, setIsRealAssessment] = useState(false)

  // Try mock data first for backward compatibility
  const mockInitial = mockAssessments.find((a) => a.id === id)
  const [assessment, setAssessment] = useState<Assessment | undefined>(mockInitial)

  // Fetch real assessment data from Supabase
  useEffect(() => {
    async function fetchAssessment() {
      // If mock data exists, use it
      if (mockInitial) {
        setIsLoading(false)
        return
      }

      const supabase = createClient()
      
      // Fetch assessment
      const { data: assessmentData, error: assessmentError } = await supabase
        .from("assessments")
        .select("*")
        .eq("id", id)
        .single()

      if (assessmentError || !assessmentData) {
        setIsLoading(false)
        return
      }

      setIsRealAssessment(true)

      // Map to Assessment type
      const mappedAssessment: Assessment = {
        id: assessmentData.id,
        name: assessmentData.name,
        studyTrackingNumber: assessmentData.study_tracking_number || "",
        protocolNumber: assessmentData.protocol_number || "",
        therapeuticArea: assessmentData.therapeutic_area,
        status: assessmentData.status === "completed" ? "IN_REVIEW" : "IN_REVIEW",
        dataSource: assessmentData.benchmark_source === "IQVIA_GRANTPLAN" ? "IQVIA GrantPlan" : "IQVIA GPI",
        vendorName: "Vendor",
        totalLineItems: 0,
        flaggedItems: 0,
        createdAt: assessmentData.created_at,
        updatedAt: assessmentData.updated_at,
        createdBy: "System",
        auditEvents: []
      }

      // Fetch comparisons with line items - using only columns that exist in DB
      const { data: comparisonsData, error: comparisonsError } = await supabase
        .from("assessment_comparisons")
        .select(`
          *,
          assessment_line_items!inner (
            id,
            procedure_name,
            country,
            vendor_cost,
            currency,
            raw_data
          )
        `)
        .eq("assessment_id", id)
        .order("created_at", { ascending: true })

      if (!comparisonsError && comparisonsData) {
        const mappedComparisons: AssessmentComparison[] = comparisonsData.map((comp: any, idx: number) => {
          // Extract data from raw_data JSONB if available
          const rawData = comp.assessment_line_items.raw_data || {}
          
          return {
          id: comp.id,
          lineItem: {
            id: comp.assessment_line_items.id,
            assessmentId: id,
            description: rawData.description || comp.assessment_line_items.procedure_name,
            unitType: rawData.unitType || "Per Unit",
            unitPrice: rawData.unitPrice || comp.assessment_line_items.vendor_cost || 0,
            site: rawData.site || comp.assessment_line_items.country || "Global",
            costCategory: rawData.costCategory || "Procedure",
            source: `Line ${idx + 1}`,
            decision: "Pending" as ItemDecision,
            // Fields from raw_data
            numberOfUnit: rawData.numberOfUnit || 1,
            totalCost: rawData.totalCost || comp.assessment_line_items.vendor_cost || 0,
            currency: comp.assessment_line_items.currency || rawData.currency || "USD",
            country: comp.assessment_line_items.country,
            additionalInformation: rawData.description
          },
          benchmark90th: comp.benchmark_90th,
          benchmarkHigh: comp.benchmark_high,
          benchmarkMed: comp.benchmark_median || comp.benchmark_90th,
          benchmarkLow: comp.benchmark_low,
          selectedBenchmarkType: "p90" as BenchmarkType,
          variance: comp.variance_percent ? (rawData.unitPrice || comp.assessment_line_items.vendor_cost || 0) * (comp.variance_percent / 100) : 0,
          variancePercent: comp.variance_percent || 0,
          flag: comp.flag as "GREEN" | "YELLOW" | "RED" | "NO_MATCH" | "MULTIPLE_MATCHES",
          benchmarkDescription: comp.ai_description || "AI-generated comparison",
          possibleMatches: comp.possible_matches ? JSON.parse(comp.possible_matches) : null,
          userSelected: comp.user_selected
        }})

        setComparisons(mappedComparisons)
        mappedAssessment.totalLineItems = mappedComparisons.length
        mappedAssessment.flaggedItems = mappedComparisons.filter(c => c.flag === "RED" || c.flag === "YELLOW").length
      }

      setAssessment(mappedAssessment)
      setIsLoading(false)
    }

    fetchAssessment()
  }, [id, mockInitial])

  const appendAudit = useCallback((action: string) => {
    const event: AuditEvent = {
      id: `ae-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userName: user?.name ?? "Unknown User",
      action,
      timestamp: new Date().toISOString(),
    }
    setAssessment((prev) =>
      prev ? { ...prev, auditEvents: [event, ...(prev.auditEvents ?? [])] } : prev
    )
  }, [user?.name])

  const handleStatusChange = useCallback((_id: string, newStatus: AssessmentStatus) => {
    setAssessment((prev) => prev ? { ...prev, status: newStatus, updatedAt: new Date().toISOString() } : prev)
    appendAudit(`Changed Status to ${statusLabels[newStatus]}`)
  }, [appendAudit])

  const handleDataSourceChange = useCallback((_id: string, newDataSource: DataSource) => {
    setAssessment((prev) => prev ? { ...prev, dataSource: newDataSource, updatedAt: new Date().toISOString() } : prev)
    appendAudit(`Changed Data Source to ${newDataSource}`)
    // Simulate benchmark refresh by recalculating variance with a small random adjustment
    setComparisons((prev) =>
      prev.map((c) => {
        const factor = newDataSource === "IQVIA GPI" ? 0.95 : 1.05
        const newBenchmark90th = c.benchmark90th ? Math.round(c.benchmark90th * factor) : undefined
        const newBenchmarkHigh = c.benchmarkHigh ? Math.round(c.benchmarkHigh * factor) : undefined
        const newBenchmarkMed = c.benchmarkMed ? Math.round(c.benchmarkMed * factor) : undefined
        const newBenchmarkLow = c.benchmarkLow ? Math.round(c.benchmarkLow * factor) : undefined
        const valMap: Record<string, number | undefined> = {
          p90: newBenchmark90th,
          high: newBenchmarkHigh,
          med: newBenchmarkMed,
          low: newBenchmarkLow,
        }
        const selectedVal = valMap[c.selectedBenchmarkType] ?? 0
        const variance = selectedVal > 0 ? c.lineItem.unitPrice - selectedVal : 0
        const variancePercent = selectedVal > 0 ? (variance / selectedVal) * 100 : 0
        let flag: "GREEN" | "YELLOW" | "RED" = "GREEN"
        if (variancePercent > 15) flag = "RED"
        else if (variancePercent > 5) flag = "YELLOW"
        const source = newDataSource === "IQVIA GrantPlan" ? "GP" : "GM"
        const desc = c.lineItem.source
          ? `${newDataSource} \u2014 ${source}${c.lineItem.source.slice(2)} | ${c.lineItem.costCategory}, ${c.lineItem.unitType}`
          : c.benchmarkDescription
        return {
          ...c,
          benchmark90th: newBenchmark90th,
          benchmarkHigh: newBenchmarkHigh,
          benchmarkMed: newBenchmarkMed,
          benchmarkLow: newBenchmarkLow,
          variance,
          variancePercent,
          flag,
          benchmarkDescription: desc,
        }
      })
    )
  }, [appendAudit])

  const [comparisons, setComparisons] = useState<AssessmentComparison[]>(
    mockAssessmentComparisons.filter((c) => c.lineItem.assessmentId === id)
  )

  const handleComparisonChange = useCallback((compId: string, field: "benchmarkDescription" | "comment", value: string) => {
    setComparisons((prev) =>
      prev.map((c) => (c.id === compId ? { ...c, [field]: value } : c))
    )
  }, [])

  const handleDecisionChange = useCallback((compId: string, decision: ItemDecision) => {
    setComparisons((prev) =>
      prev.map((c) => {
        if (c.id !== compId) return c
        const updated = { ...c, lineItem: { ...c.lineItem, decision } }
        return updated
      })
    )
    const comp = comparisons.find((c) => c.id === compId)
    if (comp) {
      appendAudit(`Changed decision for "${comp.lineItem.description}" to "${decision}"`)
    }
  }, [comparisons, appendAudit])

  const handleBenchmarkTypeChange = useCallback((compId: string, benchmarkType: BenchmarkType) => {
    setComparisons((prev) =>
      prev.map((c) => {
        if (c.id !== compId) return c
        const valMap: Record<BenchmarkType, number | undefined> = {
          p90: c.benchmark90th,
          high: c.benchmarkHigh,
          med: c.benchmarkMed,
          low: c.benchmarkLow,
        }
        const selectedVal = valMap[benchmarkType] ?? 0
        const variance = selectedVal > 0 ? c.lineItem.unitPrice - selectedVal : 0
        const variancePercent = selectedVal > 0 ? (variance / selectedVal) * 100 : 0
        let flag: "GREEN" | "YELLOW" | "RED" = "GREEN"
        if (variancePercent > 15) flag = "RED"
        else if (variancePercent > 5) flag = "YELLOW"
        return { ...c, selectedBenchmarkType: benchmarkType, variance, variancePercent, flag }
      })
    )
  }, [appendAudit])

  const handleArchive = useCallback(() => {
    setAssessment((prev) =>
      prev ? { ...prev, status: "ARCHIVED" as AssessmentStatus, updatedAt: new Date().toISOString() } : prev
    )
    // Also update the global mock data so the change persists across navigation
    const idx = mockAssessments.findIndex((a) => a.id === id)
    if (idx !== -1) {
      mockAssessments[idx] = { ...mockAssessments[idx], status: "ARCHIVED" as AssessmentStatus, updatedAt: new Date().toISOString() }
    }
    appendAudit("Marked as No Longer Required and moved to Archive")
    setShowArchiveConfirm(false)
    router.push("/archive")
  }, [id, appendAudit, router])

  const handleRestore = useCallback(() => {
    setAssessment((prev) =>
      prev ? { ...prev, status: "IN_REVIEW" as AssessmentStatus, updatedAt: new Date().toISOString() } : prev
    )
    const idx = mockAssessments.findIndex((a) => a.id === id)
    if (idx !== -1) {
      mockAssessments[idx] = { ...mockAssessments[idx], status: "IN_REVIEW" as AssessmentStatus, updatedAt: new Date().toISOString() }
    }
    appendAudit("Restored from Archive and moved back to Dashboard")
    setShowRestoreConfirm(false)
    router.push("/dashboard")
  }, [id, appendAudit, router])

  // Get unique sites from line items
  const sites = useMemo(() => {
    const siteSet = new Set(
      mockAssessmentLineItems
        .filter((item) => item.assessmentId === id)
        .map((item) => item.site)
    )
    return Array.from(siteSet)
  }, [id])

  // Calculate summary stats from stateful comparisons so they update when decisions change
  const stats = useMemo(() => {
    const items = comparisons.map((c) => c.lineItem)
    return {
      total: items.length,
      accepted: items.filter((i) => i.decision === "Accepted").length,
      pending: items.filter((i) => i.decision === "Pending").length,
      notAmended: items.filter((i) => i.decision === "Not amended").length,
      notAccepted: items.filter((i) => i.decision === "Not accepted").length,
      manualAssessment: items.filter((i) => i.decision === "Manual assessment").length,
    }
  }, [comparisons])

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Loading assessment...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  if (!assessment) {
    return (
      <AppShell>
        <div className="p-8">
          <p>Assessment not found</p>
        </div>
      </AppShell>
    )
  }

  const filteredComparisons = comparisons.filter((comparison) => {
    if (comparison.lineItem.assessmentId !== id) return false

    const matchesSearch =
      comparison.lineItem.description
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      comparison.lineItem.costCategory
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (comparison.lineItem.source?.toLowerCase() || "").includes(
        searchQuery.toLowerCase()
      )
    const matchesFlag = flagFilter === "ALL" || comparison.flag === flagFilter
    const matchesSite =
      siteFilter === "ALL" || comparison.lineItem.site === siteFilter
    const matchesDecision =
      decisionFilter === "ALL" || comparison.lineItem.decision === decisionFilter

    return matchesSearch && matchesFlag && matchesSite && matchesDecision
  })

  return (
    <AppShell>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/assessments")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {assessment.name}
              </h1>
              <p className="text-muted-foreground mt-1">{assessment.studyTrackingNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {assessment.status === "ARCHIVED" && (
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowRestoreConfirm(true)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Move to Dashboard
              </Button>
            )}
            {assessment.status !== "ARCHIVED" && (
              <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => setShowArchiveConfirm(true)}>
                <ArchiveX className="h-4 w-4 mr-2" />
                No Longer Required
              </Button>
            )}
            <Button variant="outline" onClick={() => appendAudit("Export Report clicked")}>
              <FileText className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button onClick={() => appendAudit("Download PDF clicked")}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>

        {/* Decision Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card className="border-border/40">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Items</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats.accepted}</p>
                  <p className="text-xs text-muted-foreground">Accepted</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Clock className="h-4 w-4 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <AlertTriangle className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats.notAmended}</p>
                  <p className="text-xs text-muted-foreground">Not Amended</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <XCircle className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats.notAccepted}</p>
                  <p className="text-xs text-muted-foreground">Not Accepted</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-slate-400/10">
                  <HelpCircle className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats.manualAssessment}</p>
                  <p className="text-xs text-muted-foreground">Manual Assessment</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Overview */}
        <AssessmentOverview assessment={assessment} onStatusChange={handleStatusChange} onDataSourceChange={handleDataSourceChange} />

        {/* Main Content */}
        <Tabs defaultValue="comparison" className="space-y-4">
          <TabsList>
            <TabsTrigger value="comparison">Benchmark Comparison</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions & Rationale</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="comparison" className="space-y-4">
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle>Line Items vs. Benchmarks</CardTitle>
                <CardDescription>
                  Compare proposal line items against fair market value benchmarks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-4">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by additional information, category, or source..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={siteFilter}
                    onValueChange={(value) => setSiteFilter(value)}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Site" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Sites</SelectItem>
                      {sites.map((site) => (
                        <SelectItem key={site} value={site}>
                          {site}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={decisionFilter}
                    onValueChange={(value) => setDecisionFilter(value)}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Decision" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Decisions</SelectItem>
                      <SelectItem value="Accepted">Accepted</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Not amended">Not Amended</SelectItem>
                      <SelectItem value="Not accepted">Not Accepted</SelectItem>
                      <SelectItem value="Manual assessment">Manual Assessment</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={flagFilter}
                    onValueChange={(value) =>
                      setFlagFilter(value as typeof flagFilter)
                    }
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Flag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Flags</SelectItem>
                      <SelectItem value="RED">Red Only</SelectItem>
                      <SelectItem value="YELLOW">Yellow Only</SelectItem>
                      <SelectItem value="GREEN">Green Only</SelectItem>
                      <SelectItem value="NO_MATCH">No Match</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Results count */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Showing {filteredComparisons.length} of{" "}
                    {comparisons.filter(
                      (c) => c.lineItem.assessmentId === id
                    ).length}{" "}
                    items with benchmarks
                  </span>
                  {(siteFilter !== "ALL" ||
                    decisionFilter !== "ALL" ||
                    flagFilter !== "ALL" ||
                    searchQuery) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        setSiteFilter("ALL")
                        setDecisionFilter("ALL")
                        setFlagFilter("ALL")
                        setSearchQuery("")
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>

                {/* Comparison Table */}
                <ComparisonTable comparisons={filteredComparisons} onComparisonChange={handleComparisonChange} onBenchmarkTypeChange={handleBenchmarkTypeChange} onDecisionChange={handleDecisionChange} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exceptions">
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle>Exceptions & Rationale</CardTitle>
                <CardDescription>
                  Manage exceptions and document rationale for flagged items
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <p>Exception management coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle>Audit Trail</CardTitle>
                <CardDescription>
                  A log of every user action on this assessment
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assessment.auditEvents && assessment.auditEvents.length > 0 ? (
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-border/40">
                          <TableHead>User Name</TableHead>
                          <TableHead>Action Taken</TableHead>
                          <TableHead className="text-right">Date/Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assessment.auditEvents.map((event) => (
                          <TableRow key={event.id} className="border-border/40">
                            <TableCell className="font-medium">{event.userName}</TableCell>
                            <TableCell>{event.action}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {new Date(event.timestamp).toLocaleString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                                hour12: true,
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No activity yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <span className="font-medium text-foreground">{assessment.name}</span> as
              "No Longer Required" and move it to the Archive. You can still view it from the Archive section.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move <span className="font-medium text-foreground">{assessment.name}</span> back
              to the active assessments and set its status to "In Review".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>
              Yes, restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
