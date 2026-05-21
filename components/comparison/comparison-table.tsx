"use client"

import { useState, Fragment } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ChevronDown,
  ChevronRight,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Search, Pencil, Check, X } from "lucide-react"
import type { AssessmentComparison, BenchmarkType, ItemDecision } from "@/lib/types"

// Cost category dropdown options - exact values from Excel template
const COST_CATEGORIES = [
  "Personnel",
  "Material, supplies, consumables",
  "Data license (specific for the study, supporting quote/offer provided)",
  "Equipment rental, leasing, prorate (no purchase) supporting quote/offer provided)",
  "Software rental, leasing, prorate (no purchase), supporting quote/offer provided)",
  "Patient/subjects/caregiver reimbursement of actual costs (estimated) for e.g. travel, accommodation, meals...",
  "Patient/subjects/caregiver stipend, a fixed fee to cover the costs to participate in the study (in lieu of direct reimbursement of receipts for these expenses).",
  "Patient/subjects compensation (e.g. for time to participate in the study)",
  "Study set-up fee",
  "IRB/EC submission fee",
  "Publication open-access and journal fees",
  "Publication translation and editing fees",
  "Congress registration fee",
  "Publication and Congresses placeholder for Col Res studies only",
  "Archive fees",
  "Third party details - external vendor - supporting quote provided",
  "Third party details - CRO - supporting quote provided",
  "Third party details - consultant - supporting quote provided",
  "Site specific overhead rate % (multi-site studies only)",
  "Other (costs that do not fit in any other category)",
]

interface ComparisonTableProps {
  comparisons: AssessmentComparison[]
  onComparisonChange?: (id: string, field: "benchmarkDescription" | "comment", value: string) => void
  onBenchmarkTypeChange?: (id: string, benchmarkType: BenchmarkType) => void
  onDecisionChange?: (id: string, decision: ItemDecision) => void
  onMatchSelect?: (id: string, match: any) => void
  onLineItemUpdate?: (lineItemId: string, field: "additionalInformation" | "costCategory", value: string) => void
}

const flagConfig: Record<string, { label: string; color: string }> = {
  RED: {
    label: "High Variance",
    color: "text-red-500 bg-red-500/10 border-red-500/20",
  },
  YELLOW: {
    label: "Moderate",
    color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  },
  GREEN: {
    label: "Within Range",
    color: "text-green-500 bg-green-500/10 border-green-500/20",
  },
  NO_MATCH: {
    label: "Not Found",
    color: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  },
  MULTIPLE_MATCHES: {
    label: "Select Match",
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  },
  NO_BENCHMARK_DATA: {
    label: "No Data",
    color: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  },
  NON_COMPARABLE: {
    label: "Non-comparable",
    color: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  },
  SKIPPED_BY_DECISION: {
    label: "No comparison needed",
    color: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  },
}

const decisionConfig: Record<
  ItemDecision,
  { label: string; color: string }
> = {
  "In-review": {
    label: "In-review",
    color: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  },
  Accepted: {
    label: "Accepted",
    color: "text-green-500 bg-green-500/10 border-green-500/20",
  },
  Pending: {
    label: "Pending",
    color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  },
  "Not amended": {
    label: "Not amended",
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  },
  "Not accepted": {
    label: "Not accepted",
    color: "text-red-500 bg-red-500/10 border-red-500/20",
  },
  "Manual assessment": {
    label: "Manual assessment",
    color: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  },
}

function getBenchmarkValue(comparison: AssessmentComparison): number | undefined {
  switch (comparison.selectedBenchmarkType) {
    case "p90": return comparison.benchmark90th
    case "high": return comparison.benchmarkHigh
    case "med": return comparison.benchmarkMed
    case "low": return comparison.benchmarkLow
    default: return comparison.benchmark90th
  }
}

const benchmarkLabels: Record<BenchmarkType, string> = {
  p90: "90th Percentile",
  high: "High",
  med: "Med",
  low: "Low",
}

const DECISION_OPTIONS: ItemDecision[] = ["In-review", "Accepted", "Pending", "Not amended", "Not accepted", "Manual assessment"]

export function ComparisonTable({ comparisons, onComparisonChange, onBenchmarkTypeChange, onDecisionChange, onMatchSelect, onLineItemUpdate }: ComparisonTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [selectedComparison, setSelectedComparison] = useState<AssessmentComparison | null>(null)
  
  // Editing state for additional information
  const [editingAdditionalInfo, setEditingAdditionalInfo] = useState<string | null>(null)
  const [editAdditionalInfoValue, setEditAdditionalInfoValue] = useState("")

  const openMatchModal = (comparison: AssessmentComparison) => {
    setSelectedComparison(comparison)
    setMatchModalOpen(true)
  }

  const handleSelectMatch = (match: any) => {
    if (selectedComparison && onMatchSelect) {
      onMatchSelect(selectedComparison.id, match)
    }
    setMatchModalOpen(false)
    setSelectedComparison(null)
  }
  
  // Handle additional information edit
  const startEditingAdditionalInfo = (comparison: AssessmentComparison) => {
    setEditingAdditionalInfo(comparison.lineItem.id)
    setEditAdditionalInfoValue(comparison.lineItem.additionalInformation || comparison.lineItem.description || "")
  }
  
  const saveAdditionalInfo = (lineItemId: string) => {
    if (onLineItemUpdate) {
      onLineItemUpdate(lineItemId, "additionalInformation", editAdditionalInfoValue)
    }
    setEditingAdditionalInfo(null)
    setEditAdditionalInfoValue("")
  }
  
  const cancelEditingAdditionalInfo = () => {
    setEditingAdditionalInfo(null)
    setEditAdditionalInfoValue("")
  }
  
  // Handle cost category change
  const handleCostCategoryChange = (lineItemId: string, value: string) => {
    if (onLineItemUpdate) {
      onLineItemUpdate(lineItemId, "costCategory", value)
    }
  }
  
  // Calculate total cost sum
  const totalCostSum = comparisons.reduce((sum, comp) => sum + (comp.lineItem.totalCost || 0), 0)
  const primaryCurrency = comparisons[0]?.lineItem.currency || "USD"

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const formatCurrency = (value: number, currency?: string) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value)
    } catch {
      // Fallback for invalid currency codes
      return `${currency || "$"}${value.toLocaleString()}`
    }
  }

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Cost Category</TableHead>
            <TableHead>Cost Description</TableHead>
            <TableHead className="min-w-[220px]">Benchmark Match</TableHead>
            <TableHead className="text-right">Number of Unit</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Negotiated Price</TableHead>
            <TableHead className="text-right">Total Cost</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="min-w-[200px]">Benchmark</TableHead>
            <TableHead className="text-right">Variance</TableHead>
            <TableHead>Flag</TableHead>
            <TableHead>Decision</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparisons.map((comparison) => {
            const isExpanded = expandedRows.has(comparison.id)
            const decisionConf = decisionConfig[comparison.lineItem.decision]
            const selectedValue = getBenchmarkValue(comparison) ?? 0
            const dynamicVariance = selectedValue > 0 ? comparison.lineItem.unitPrice - selectedValue : 0
            const dynamicVariancePercent = selectedValue > 0 ? (dynamicVariance / selectedValue) * 100 : 0
            const dynamicFlag: "GREEN" | "YELLOW" | "RED" = dynamicVariancePercent > 15 ? "RED" : dynamicVariancePercent > 5 ? "YELLOW" : "GREEN"
            const flagConf = flagConfig[dynamicFlag]

            const varianceIcon =
              dynamicVariance > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : dynamicVariance < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )

            return (
              <Fragment key={comparison.id}>
                <TableRow className="border-border/40">
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleRow(comparison.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {comparison.lineItem.site}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={comparison.lineItem.costCategory || ""}
                      onValueChange={(val) => handleCostCategoryChange(comparison.lineItem.id, val)}
                    >
                      <SelectTrigger className="h-8 text-xs min-w-[180px] max-w-[220px] border-border/40">
                        <SelectValue placeholder="Select category">
                          <span className="truncate">{comparison.lineItem.costCategory || "Select category"}</span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {COST_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat} className="text-xs">
                            <span className="truncate max-w-[300px] block">{cat}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="min-w-[300px] max-w-[450px]" onClick={(e) => e.stopPropagation()}>
                    {editingAdditionalInfo === comparison.lineItem.id ? (
                      <div className="flex flex-col gap-2">
                        <Textarea
                          value={editAdditionalInfoValue}
                          onChange={(e) => setEditAdditionalInfoValue(e.target.value)}
                          className="min-h-[100px] text-sm resize-y"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.ctrlKey) saveAdditionalInfo(comparison.lineItem.id)
                            if (e.key === "Escape") cancelEditingAdditionalInfo()
                          }}
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-muted-foreground">Ctrl+Enter to save</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-green-600 gap-1"
                            onClick={() => saveAdditionalInfo(comparison.lineItem.id)}
                          >
                            <Check className="h-4 w-4" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-red-600 gap-1"
                            onClick={cancelEditingAdditionalInfo}
                          >
                            <X className="h-4 w-4" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <div className="text-sm font-medium whitespace-normal break-words flex-1">
                          {comparison.lineItem.additionalInformation || comparison.lineItem.description}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => startEditingAdditionalInfo(comparison)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[220px]" onClick={(e) => e.stopPropagation()}>
                    {comparison.possibleMatches && comparison.possibleMatches.length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs w-full justify-start gap-2"
                        onClick={() => openMatchModal(comparison)}
                      >
                        <Search className="h-3 w-3" />
                        <span className="truncate">
                          {comparison.userSelected 
                            ? comparison.possibleMatches.find((m: any) => m.benchmarkId === comparison.userSelected)?.procedureName || "View Matches"
                            : `${comparison.possibleMatches.length} match${comparison.possibleMatches.length > 1 ? 'es' : ''} found`}
                        </span>
                      </Button>
                    ) : comparison.flag === "NO_MATCH" ? (
                      <span className="text-xs text-muted-foreground italic">No match found</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {comparison.benchmarkDescription || "Pending comparison"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {comparison.lineItem.numberOfUnit ?? comparison.lineItem.numberOfUnits ?? "-"}
                  </TableCell>
                  <TableCell className="text-right font-medium font-mono">
                    {comparison.lineItem.unitPrice?.toLocaleString() ?? "-"}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="number"
                      value={comparison.lineItem.negotiatedPrice ?? ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? null : parseFloat(e.target.value)
                        onLineItemUpdate?.(comparison.lineItem.id, "negotiatedPrice", value as any)
                      }}
                      placeholder="Enter price"
                      className="h-8 w-[120px] text-right font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {comparison.lineItem.totalCost?.toLocaleString() ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {comparison.lineItem.currency || "USD"}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={comparison.selectedBenchmarkType}
                      onValueChange={(val) => onBenchmarkTypeChange?.(comparison.id, val as BenchmarkType)}
                    >
                      <SelectTrigger className="h-8 text-xs min-w-[185px] border-border/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["p90", "high", "med", "low"] as BenchmarkType[]).map((type) => {
                          const val = type === "p90" ? comparison.benchmark90th
                            : type === "high" ? comparison.benchmarkHigh
                            : type === "med" ? comparison.benchmarkMed
                            : comparison.benchmarkLow
                          return (
                            <SelectItem key={type} value={type}>
                              {benchmarkLabels[type]} ({val != null ? formatCurrency(val, comparison.lineItem.currency) : "-"})
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {varianceIcon}
                      <span
                        className={
                          dynamicVariance > 0
                            ? "text-red-500"
                            : dynamicVariance < 0
                              ? "text-green-500"
                              : "text-muted-foreground"
                        }
                      >
                        {dynamicVariancePercent > 0 ? "+" : ""}
                        {dynamicVariancePercent.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={flagConf?.color || "text-slate-400 bg-slate-400/10"} variant="outline">
                      {flagConf?.label || comparison.flag}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={comparison.lineItem.decision}
                      onValueChange={(val) => {
                        console.log("[v0] Select onValueChange fired:", comparison.id, "current=", comparison.lineItem.decision, "new=", val)
                        onDecisionChange?.(comparison.id, val as ItemDecision)
                      }}
                    >
                      <SelectTrigger className={`h-7 text-xs font-medium border rounded-full px-3 min-w-[150px] ${decisionConf.color}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DECISION_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow className="border-border/40 bg-accent/30">
                    <TableCell colSpan={13}>
                      <div className="py-4 px-2 space-y-4">
                        {/* Item Details */}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Country</p>
                            <p className="font-medium mt-1">
                              {comparison.lineItem.country || "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Benchmark Low</p>
                            <p className="font-medium mt-1">
                              {comparison.benchmarkLow
                                ? formatCurrency(comparison.benchmarkLow, comparison.lineItem.currency || "USD")
                                : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Benchmark Med</p>
                            <p className="font-medium mt-1">
                              {comparison.benchmarkMed
                                ? formatCurrency(comparison.benchmarkMed, comparison.lineItem.currency || "USD")
                                : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Benchmark High</p>
                            <p className="font-medium mt-1">
                              {comparison.benchmarkHigh
                                ? formatCurrency(comparison.benchmarkHigh, comparison.lineItem.currency || "USD")
                                : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Benchmark 90th</p>
                            <p className="font-medium mt-1">
                              {comparison.benchmark90th
                                ? formatCurrency(comparison.benchmark90th, comparison.lineItem.currency || "USD")
                                : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Accepted Price</p>
                            <p className="font-medium mt-1">
                              {comparison.lineItem.acceptedUnitPrice
                                ? formatCurrency(comparison.lineItem.acceptedUnitPrice, comparison.lineItem.currency || "USD")
                                : "-"}
                            </p>
                          </div>
                        </div>

                        {/* Note/Logic */}
                        {comparison.lineItem.noteLogic && (
                          <div className="text-sm">
                            <p className="text-muted-foreground mb-1">
                              Note / Logic
                            </p>
                            <p className="text-foreground">
                              {comparison.lineItem.noteLogic}
                            </p>
                          </div>
                        )}

                        {/* Question/Comment */}
                        {comparison.lineItem.questionComment && (
                          <Card className="border-amber-500/20 bg-amber-500/5">
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                <MessageSquare className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-amber-500 mb-1">
                                    Question / Comment
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {comparison.lineItem.questionComment}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </Card>
                        )}

                        {/* AI Suggestion */}
                        {comparison.aiSuggestion && (
                          <Card className="border-blue-500/20 bg-blue-500/5">
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                <Lightbulb className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-blue-500 mb-1">
                                    AI Insight
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {comparison.aiSuggestion}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </Card>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
          {/* Total Row */}
          <TableRow className="border-border/40 bg-muted/50 font-semibold">
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right font-bold">
              Total: {formatCurrency(totalCostSum, primaryCurrency)}
            </TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableBody>
      </Table>

      {/* Benchmark Match Selection Modal - Full Width */}
      <Dialog open={matchModalOpen} onOpenChange={setMatchModalOpen}>
        <DialogContent className="!max-w-[95vw] !w-[95vw] !max-h-[90vh] overflow-hidden flex flex-col p-6">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-xl">Select Benchmark Match</DialogTitle>
            <DialogDescription>
              {selectedComparison && (
                <span>
                  Matching benchmarks for: <strong className="text-foreground">{selectedComparison.lineItem.additionalInformation || selectedComparison.lineItem.description}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto border rounded-lg min-h-[400px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 border-b">
                <TableRow>
                  <TableHead className="w-[40%]">Procedure Name</TableHead>
                  <TableHead className="w-[12%]">Country</TableHead>
                  <TableHead className="text-right w-[10%]">P25 (Low)</TableHead>
                  <TableHead className="text-right w-[10%]">P50 (Med)</TableHead>
                  <TableHead className="text-right w-[10%]">P75 (High)</TableHead>
                  <TableHead className="text-right w-[10%]">P90</TableHead>
                  <TableHead className="w-[8%] text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedComparison?.possibleMatches?.map((match: any, idx: number) => (
                  <TableRow key={match.benchmarkId || idx} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{match.procedureName}</span>
                        {match.category && (
                          <Badge variant="outline" className="w-fit text-xs">
                            {match.category}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {match.country || selectedComparison.lineItem.country || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {match.p25 != null ? match.p25.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {match.p50 != null ? match.p50.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {match.p75 != null ? match.p75.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {match.p90 != null ? match.p90.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        onClick={() => handleSelectMatch(match)}
                      >
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!selectedComparison?.possibleMatches || selectedComparison.possibleMatches.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No matching benchmarks found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
