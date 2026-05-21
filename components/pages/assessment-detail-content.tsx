"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
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
  Sparkles,
  Loader2,
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
  const [isRunningComparison, setIsRunningComparison] = useState(false)
  const [comparisonComplete, setComparisonComplete] = useState(false)

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

      // Fetch assessment via API (server-side to bypass RLS)
      const assessmentResponse = await fetch(`/api/assessments/${id}`)
      const { assessment: assessmentData, error: assessmentError } = await assessmentResponse.json()

      if (assessmentError || !assessmentData) {
        console.log("[v0] Error fetching assessment:", assessmentError)
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
        status: (assessmentData.status || "IN_REVIEW") as AssessmentStatus,
        dataSource: assessmentData.benchmark_source === "IQVIA_GRANTPLAN" ? "IQVIA GrantPlan" : "IQVIA GPI",
        vendorName: "Vendor",
        totalLineItems: 0,
        flaggedItems: 0,
        createdAt: assessmentData.created_at,
        updatedAt: assessmentData.updated_at,
        createdBy: "System",
        auditEvents: []
      }

      // Fetch comparisons via API (server-side to bypass RLS)
      const comparisonsResponse = await fetch(`/api/assessments/${id}/comparisons`)
      const { comparisons: comparisonsData, error: comparisonsError } = await comparisonsResponse.json()

      console.log("[v0] Comparisons fetch result:", comparisonsData?.length, "items, error:", comparisonsError)
      
      // Check if any comparison has ai_matches (meaning comparison was already run)
      const hasExistingMatches = comparisonsData?.some((comp: any) => comp.ai_matches && comp.ai_matches.length > 0)
      console.log("[v0] Has existing ai_matches:", hasExistingMatches)
      if (hasExistingMatches) {
        setComparisonComplete(true)
      }

      if (!comparisonsError && comparisonsData) {
        const mappedComparisons: AssessmentComparison[] = comparisonsData.map((comp: any, idx: number) => {
          // Parse extra data from procedure_name (format: "description|||{json}")
          const procedureName = comp.assessment_line_items.procedure_name || ""
          const [description, extraDataStr] = procedureName.split("|||")
          let extraData = { numberOfUnit: 1, unitPrice: 0, unitType: null, costCategory: null }
          try {
            if (extraDataStr) {
              extraData = JSON.parse(extraDataStr)
            }
          } catch (e) {
            // Keep defaults if parsing fails
          }
          
          // Parse ai_matches from comparison's ai_matches field (stored during run-comparison)
          let matches: any[] = []
          let originalFlag: string | null = null
          if (comp.ai_matches) {
            try {
              const parsed = Array.isArray(comp.ai_matches) ? comp.ai_matches : JSON.parse(comp.ai_matches)
              // Detect sentinel meta entry stashed by run-comparison when an extended flag
              // (NON_COMPARABLE / SKIPPED_BY_DECISION / NO_BENCHMARK_DATA) was mapped to NO_MATCH for DB storage.
              if (parsed.length === 1 && parsed[0]?.__meta) {
                originalFlag = parsed[0].originalFlag || null
                matches = []
              } else {
                matches = parsed
              }
              console.log("[v0] Loaded ai_matches for line item:", matches.length, "matches", "originalFlag:", originalFlag)
            } catch (e) {
              console.log("[v0] Error parsing ai_matches:", e)
              matches = []
            }
          }
          const bestMatch = matches[0]
          const effectiveFlag = originalFlag || comp.flag || (matches.length > 0 ? "MULTIPLE_MATCHES" : "NO_MATCH")
          
          return {
          id: comp.id,
          lineItem: {
            id: comp.assessment_line_items.id,
            assessmentId: id,
            description: description.trim(),
            unitType: extraData.unitType || "Per Unit",
            unitPrice: extraData.unitPrice || 0,
            site: comp.assessment_line_items.country || "Global",
            costCategory: extraData.costCategory || "Procedure",
            source: `Line ${idx + 1}`,
            decision: (extraData.decision || "In-review") as ItemDecision,
            numberOfUnit: extraData.numberOfUnit || 1,
  totalCost: comp.assessment_line_items.vendor_cost || 0,
  currency: comp.assessment_line_items.currency || "USD",
  country: comp.assessment_line_items.country,
  additionalInformation: description.trim(),
  negotiatedPrice: comp.assessment_line_items.negotiated_price ?? null
          },
          benchmark90th: comp.benchmark_90th || bestMatch?.p90,
          benchmarkHigh: comp.benchmark_high || bestMatch?.p75,
          benchmarkMed: comp.benchmark_median || comp.benchmark_90th || bestMatch?.p50,
          benchmarkLow: comp.benchmark_low || bestMatch?.p25,
          selectedBenchmarkType: "p90" as BenchmarkType,
          variance: comp.variance_percent ? (comp.assessment_line_items.vendor_cost || 0) * (comp.variance_percent / 100) : 0,
  variancePercent: comp.variance_percent || 0,
  flag: effectiveFlag as any,
  benchmarkDescription: bestMatch ? `${bestMatch.procedureName} (${Math.round((bestMatch.similarity || 0) * 100)}% match)` : (
    originalFlag === "NON_COMPARABLE" ? "Non-comparable item (tax/discount/overhead)" :
    originalFlag === "SKIPPED_BY_DECISION" ? "Per status, no comparison needed" :
    originalFlag === "NO_BENCHMARK_DATA" ? "No benchmark data for this country" :
    "No match found"
  ),
  possibleMatches: matches.length > 0 ? matches : null,
  userSelected: comp.user_selected_benchmark_id || null
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
    let lineItemId: string | null = null
    let description = ""
    setComparisons((prev) =>
      prev.map((c) => {
        if (c.id !== compId) return c
        lineItemId = c.lineItem.id
        description = c.lineItem.description
        const updated = { ...c, lineItem: { ...c.lineItem, decision } }
        return updated
      })
    )
    if (lineItemId) {
      // Persist decision so it is honored by the next "Run Comparison".
      fetch(`/api/assessments/line-items/${lineItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      }).catch((err) => console.log("[v0] Failed to persist decision change:", err))
    }
    if (description) {
      appendAudit(`Changed decision for "${description}" to "${decision}"`)
    }
  }, [appendAudit])

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

  // Handle user selecting a benchmark match from dropdown
  const handleMatchSelect = useCallback((compId: string, match: any) => {
    setComparisons((prev) =>
      prev.map((c) => {
        if (c.id !== compId) return c
        // Update comparison with selected benchmark values
        const benchmarkLow = match.p25 || null
        const benchmarkMed = match.p50 || null
        const benchmarkHigh = match.p75 || null
        const benchmark90th = match.p90 || null
        
        // Calculate variance against selected benchmark type
        const selectedVal = benchmark90th || benchmarkHigh || benchmarkMed || 0
        const variance = selectedVal > 0 ? c.lineItem.unitPrice - selectedVal : 0
        const variancePercent = selectedVal > 0 ? (variance / selectedVal) * 100 : 0
        let flag: "GREEN" | "YELLOW" | "RED" = "GREEN"
        if (variancePercent > 15) flag = "RED"
        else if (variancePercent > 5) flag = "YELLOW"
        
        return {
          ...c,
          benchmarkLow,
          benchmarkMed,
          benchmarkHigh,
          benchmark90th,
          variance,
          variancePercent,
          flag,
          benchmarkDescription: `${match.procedureName} (${Math.round(match.similarity * 100)}% match)`,
          userSelected: match.benchmarkId
        }
      })
    )
    appendAudit(`Selected benchmark match: ${match.procedureName}`)
  }, [appendAudit])

  const handleExportReport = useCallback(() => {
    if (!assessment) return

    // Build rows from current comparisons (in-memory state = current at-time version)
    const rows = comparisons.map((comp, idx) => {
      const li = comp.lineItem
      const selected = comp.userSelected || (comp.possibleMatches && comp.possibleMatches[0]) || null
      const benchmarkValue =
        comp.selectedBenchmarkType === "p25" ? comp.benchmarkLow :
        comp.selectedBenchmarkType === "p50" ? comp.benchmarkMed :
        comp.selectedBenchmarkType === "p75" ? comp.benchmarkHigh :
        comp.benchmark90th
      const variance = comp.variance ?? 0
      const variancePct = comp.variancePercent ?? 0

      return {
        "#": idx + 1,
        "Description": li.description || "",
        "Site/Country": li.country || li.site || "",
        "Cost Category": li.costCategory || "",
        "Unit Type": li.unitType || "",
        "Number of Units": li.numberOfUnit ?? "",
        "Unit Price": li.unitPrice ?? "",
        "Total Cost": li.totalCost ?? "",
        "Currency": li.currency || "",
        "Negotiated Price": li.negotiatedPrice ?? "",
        "Decision": li.decision || "",
        "Flag": comp.flag || "",
        "Matched Benchmark": selected?.procedureName || comp.benchmarkDescription || "",
        "Match Confidence": selected?.confidence || "",
        "Benchmark P25": comp.benchmarkLow ?? "",
        "Benchmark P50": comp.benchmarkMed ?? "",
        "Benchmark P75": comp.benchmarkHigh ?? "",
        "Benchmark P90": comp.benchmark90th ?? "",
        "Selected Benchmark Type": comp.selectedBenchmarkType || "",
        "Selected Benchmark Value": benchmarkValue ?? "",
        "Variance": variance,
        "Variance %": variancePct,
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...rows.map((r: any) => String(r[key] ?? "").length)
      )
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) }
    })
    worksheet["!cols"] = colWidths

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assessment")

    // Build timestamp DDMMYYHHMMSS
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const ts = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

    // Sanitize filename
    const safeName = (assessment.name || "assessment").replace(/[\\/:*?"<>|]/g, "_").trim()
    const filename = `${safeName} ${ts}.xlsx`

    XLSX.writeFile(workbook, filename)
    appendAudit(`Exported report: ${filename}`)
  }, [assessment, comparisons, appendAudit])

  const handleArchive = useCallback(async () => {
    try {
      // Update status in database via API
      const response = await fetch(`/api/assessments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        console.error("[v0] Error archiving assessment:", error)
        return
      }
      
      setAssessment((prev) =>
        prev ? { ...prev, status: "ARCHIVED" as AssessmentStatus, updatedAt: new Date().toISOString() } : prev
      )
      appendAudit("Marked as No Longer Required and moved to Archive")
      setShowArchiveConfirm(false)
      router.push("/archive")
    } catch (error) {
      console.error("[v0] Error archiving assessment:", error)
    }
  }, [id, appendAudit, router])

  const handleRestore = useCallback(async () => {
    try {
      // Update status in database via API
      const response = await fetch(`/api/assessments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_REVIEW" }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        console.error("[v0] Error restoring assessment:", error)
        return
      }
      
      setAssessment((prev) =>
        prev ? { ...prev, status: "IN_REVIEW" as AssessmentStatus, updatedAt: new Date().toISOString() } : prev
      )
      appendAudit("Restored from Archive and moved back to Dashboard")
      setShowRestoreConfirm(false)
      router.push("/dashboard")
    } catch (error) {
      console.error("[v0] Error restoring assessment:", error)
    }
  }, [id, appendAudit, router])

  // Run AI benchmark comparison
  const handleRunComparison = useCallback(async () => {
    console.log("[v0] handleRunComparison called, comparisons.length:", comparisons.length)
    
    setIsRunningComparison(true)
    appendAudit("Started AI Benchmark Comparison")
    
    try {
      // First fetch the linked benchmark file IDs for this assessment
      const supabase = createClient()
      const { data: benchmarkLinks } = await supabase
        .from("assessment_benchmark_files")
        .select("benchmark_file_id")
        .eq("assessment_id", id)
      
      const benchmarkFileIds = benchmarkLinks?.map(link => link.benchmark_file_id) || []
      console.log("[v0] Linked benchmark files for comparison:", benchmarkFileIds.length)
      
      const response = await fetch("/api/assessments/run-comparison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: id, benchmarkFileIds })
      })
      
      const result = await response.json()
      
      console.log("[v0] Comparison API result:", result)
      
      if (result.success && result.results) {
        // Build a map of AI results by lineItemId for easy lookup
        const aiResultsMap = new Map(result.results.map((r: any) => [r.lineItemId, r]))
        
        // Refresh the comparisons data - fetch comparisons and line items separately
        console.log("[v0] Refreshing comparisons data via API...")
        
        // Fetch comparisons via API (server-side to bypass RLS)
        const comparisonsResponse = await fetch(`/api/assessments/${id}/comparisons`)
        const { comparisons: comparisonsData, error: compError } = await comparisonsResponse.json()

        console.log("[v0] Refresh result - comparisons:", comparisonsData?.length, "error:", compError)
        
        if (comparisonsData && comparisonsData.length > 0) {
          const mappedComparisons: AssessmentComparison[] = comparisonsData.map((comp: any, idx: number) => {
              // API returns assessment_line_items joined
              const lineItem = comp.assessment_line_items
              const procedureName = lineItem?.procedure_name || ""
              const [description, extraDataStr] = procedureName.split("|||")
              let extraData = { numberOfUnit: 1, unitPrice: 0, unitType: null, costCategory: null }
              try {
                if (extraDataStr) extraData = JSON.parse(extraDataStr)
              } catch (e) {}
              
              // Get AI matches from database (stored during run-comparison)
              let matches: any[] = []
              let originalFlag: string | null = null
              if (comp.ai_matches) {
                try {
                  const parsed = Array.isArray(comp.ai_matches) ? comp.ai_matches : JSON.parse(comp.ai_matches)
                  if (parsed.length === 1 && parsed[0]?.__meta) {
                    originalFlag = parsed[0].originalFlag || null
                    matches = []
                  } else {
                    matches = parsed
                  }
                  console.log("[v0] Refresh - loaded", matches.length, "matches", "originalFlag:", originalFlag)
                } catch (e) {
                  matches = []
                }
              }
              const bestMatch = matches.length > 0 ? matches[0] : null
              const effectiveFlag = originalFlag || comp.flag || (matches.length > 0 ? "MULTIPLE_MATCHES" : "NO_MATCH")
              
              return {
                id: comp.id,
                lineItem: {
                  id: lineItem?.id || comp.line_item_id,
                  assessmentId: id,
                  description: description.trim(),
                  unitType: extraData.unitType || "Per Unit",
                  unitPrice: extraData.unitPrice || 0,
                  site: lineItem?.country || "Global",
                  costCategory: extraData.costCategory || "Procedure",
                  source: `Line ${idx + 1}`,
                  decision: (extraData.decision || "In-review") as ItemDecision,
                  numberOfUnit: extraData.numberOfUnit || 1,
                  totalCost: lineItem?.vendor_cost || 0,
                  currency: lineItem?.currency || "USD",
                  country: lineItem?.country,
                  additionalInformation: description.trim(),
                  negotiatedPrice: lineItem?.negotiated_price ?? null
                },
                benchmark90th: bestMatch?.p90 || null,
                benchmarkHigh: bestMatch?.p75 || null,
                benchmarkMed: bestMatch?.p50 || null,
                benchmarkLow: bestMatch?.p25 || null,
                selectedBenchmarkType: "p90" as BenchmarkType,
                variance: 0,
                variancePercent: 0,
                flag: effectiveFlag as any,
                benchmarkDescription: bestMatch 
                  ? `${bestMatch.procedureName} (${Math.round(bestMatch.similarity * 100)}% match)`
                  : (
                      originalFlag === "NON_COMPARABLE" ? "Non-comparable item (tax/discount/overhead)" :
                      originalFlag === "SKIPPED_BY_DECISION" ? "Per status, no comparison needed" :
                      originalFlag === "NO_BENCHMARK_DATA" ? "No benchmark data for this country" :
                      "No match found"
                    ),
                possibleMatches: matches.length > 0 ? matches : null,
                userSelected: null
              }})
          console.log("[v0] Mapped comparisons:", mappedComparisons.length, "First item matches:", mappedComparisons[0]?.possibleMatches?.length)
          setComparisons(mappedComparisons)
        } else {
          console.log("[v0] No comparisons data returned from refresh query")
        }
        
        setComparisonComplete(true)
        appendAudit(`Completed AI Benchmark Comparison: ${result.message}`)
      } else {
        appendAudit(`Benchmark Comparison failed: ${result.error}`)
      }
    } catch (error: any) {
      appendAudit(`Benchmark Comparison error: ${error.message}`)
    } finally {
      setIsRunningComparison(false)
    }
  }, [id, comparisons.length, appendAudit])

  // Handle line item field updates (additional information, cost category)
  const handleLineItemUpdate = useCallback(async (lineItemId: string, field: "additionalInformation" | "costCategory", value: string) => {
    try {
      const response = await fetch(`/api/assessments/line-items/${lineItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value })
      })
      
      if (response.ok) {
        // Update local state
        setComparisons(prev => prev.map(comp => {
          if (comp.lineItem.id === lineItemId) {
            return {
              ...comp,
              lineItem: {
                ...comp.lineItem,
                [field]: value,
                // Also update description if it's additionalInformation
                ...(field === "additionalInformation" ? { description: value } : {})
              }
            }
          }
          return comp
        }))
        const fieldNames: Record<string, string> = {
          additionalInformation: "Additional Information",
          costCategory: "Cost Category",
          negotiatedPrice: "Negotiated Price"
        }
        appendAudit(`Updated ${fieldNames[field] || field} for line item`)
      } else {
        console.error("[v0] Failed to update line item:", await response.text())
      }
    } catch (error) {
      console.error("[v0] Error updating line item:", error)
    }
  }, [appendAudit])

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
            <Button variant="outline" onClick={handleExportReport}>
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
                {/* Run Benchmark Comparison Button */}
                {isRealAssessment && (
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/40">
                    <div>
                      <h4 className="font-medium">AI Benchmark Matching</h4>
                      <p className="text-sm text-muted-foreground">
                        Use AI to match line items against benchmark procedures
                      </p>
                    </div>
                    <Button
                      onClick={handleRunComparison}
                      disabled={isRunningComparison}
                      className="min-w-[200px]"
                    >
                      {isRunningComparison ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Running Comparison...
                        </>
                      ) : comparisonComplete ? (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Re-run Comparison
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Run Benchmark Comparison
                        </>
                      )}
                    </Button>
                  </div>
                )}
                
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
                <ComparisonTable comparisons={filteredComparisons} onComparisonChange={handleComparisonChange} onBenchmarkTypeChange={handleBenchmarkTypeChange} onDecisionChange={handleDecisionChange} onMatchSelect={handleMatchSelect} onLineItemUpdate={handleLineItemUpdate} />
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
