"use client"

import { useState, useRef, useEffect, Fragment } from "react"
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
import { COST_CATEGORIES } from "@/lib/cost-categories"

interface ComparisonTableProps {
  comparisons: AssessmentComparison[]
  onComparisonChange?: (id: string, field: "benchmarkDescription" | "comment", value: string) => void
  onBenchmarkTypeChange?: (id: string, benchmarkType: BenchmarkType) => void
  onDecisionChange?: (id: string, decision: ItemDecision) => void
  onMatchSelect?: (id: string, match: any) => void
  onLineItemUpdate?: (lineItemId: string, field: "additionalInformation" | "costCategory" | "comment", value: string) => void
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
    label: "No match",
    color: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  },
  MULTIPLE_MATCHES: {
    label: "Select Match",
    color: "text-primary bg-primary/10 border-primary/20",
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
  "To Assess": {
    label: "To Assess",
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  },
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
    color: "text-foreground bg-muted border-border",
  },
  "Not accepted": {
    label: "Not accepted",
    color: "text-red-500 bg-red-500/10 border-red-500/20",
  },
  "Manual assessment": {
    label: "Manual assessment",
    color: "text-slate-400 bg-slate-400/10 border-slate-400/20",
  },
  Escalate: {
    label: "Escalate",
    color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
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

const DECISION_OPTIONS: ItemDecision[] = ["To Assess", "In-review", "Accepted", "Pending", "Not amended", "Not accepted", "Manual assessment", "Escalate"]

// Compute the effective Total Cost for a line item.
// Total Cost is always calculated as price * number of units.
// If a negotiated price has been entered, it supersedes the unit price;
// otherwise the unit price is used.
export function getEffectiveTotalCost(lineItem: {
  negotiatedPrice?: number | null
  unitPrice?: number | null
  numberOfUnit?: number
  numberOfUnits?: number
  totalCost?: number | null
}): number {
  const units = lineItem.numberOfUnit ?? lineItem.numberOfUnits ?? 1
  const effectivePrice =
    lineItem.negotiatedPrice != null && lineItem.negotiatedPrice > 0
      ? lineItem.negotiatedPrice
      : lineItem.unitPrice ?? 0
  return effectivePrice * units
}

export function ComparisonTable({ comparisons, onComparisonChange, onBenchmarkTypeChange, onDecisionChange, onMatchSelect, onLineItemUpdate }: ComparisonTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [selectedComparison, setSelectedComparison] = useState<AssessmentComparison | null>(null)
  
  // Editing state for additional information
  const [editingAdditionalInfo, setEditingAdditionalInfo] = useState<string | null>(null)
  const [editAdditionalInfoValue, setEditAdditionalInfoValue] = useState("")

  // Local draft state for the free-text comment column, keyed by line item id.
  // We keep the typed value local for responsiveness and only persist on blur
  // (via onLineItemUpdate) so we don't fire a PATCH on every keystroke.
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})

  // Local draft state for the negotiated price input, keyed by line item id.
  // Typing updates this immediately so the input stays responsive; we only
  // persist (via onLineItemUpdate) on blur instead of awaiting a PATCH on every
  // keystroke, which previously caused dropped characters / input lag.
  const [negotiatedPriceDrafts, setNegotiatedPriceDrafts] = useState<Record<string, string>>({})

  // Per-row "user opened the Decision dropdown" gate. Radix Select fires
  // `onValueChange` during controlled-value reconciliation (without any user
  // pointer/keyboard input), and those echoes were corrupting the DB. We only
  // treat onValueChange as real if the trigger was opened by the user since
  // the last fire.
  const decisionUserOpenRef = useRef<Set<string>>(new Set())

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
  
  // Calculate total cost sum (uses negotiated price over unit price when available)
  const totalCostSum = comparisons.reduce((sum, comp) => sum + getEffectiveTotalCost(comp.lineItem), 0)
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

  // --- Sticky horizontal scrollbar ---------------------------------------
  // The table is taller than the viewport, so its native horizontal scrollbar
  // sits far below the fold and is hard to reach. We render a thin proxy
  // scrollbar that is pinned to the bottom of the viewport (position: sticky)
  // and keep its scroll position in sync with the real table scroller, so the
  // user can scroll left/right from any vertical position.
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const stickyBarRef = useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [clientWidth, setClientWidth] = useState(0)
  const syncingRef = useRef<"table" | "bar" | null>(null)

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const measure = () => {
      setScrollWidth(el.scrollWidth)
      setClientWidth(el.clientWidth)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [comparisons, expandedRows])

  const handleTableScroll = () => {
    if (syncingRef.current === "bar") {
      syncingRef.current = null
      return
    }
    if (tableScrollRef.current && stickyBarRef.current) {
      syncingRef.current = "table"
      stickyBarRef.current.scrollLeft = tableScrollRef.current.scrollLeft
    }
  }

  const handleBarScroll = () => {
    if (syncingRef.current === "table") {
      syncingRef.current = null
      return
    }
    if (tableScrollRef.current && stickyBarRef.current) {
      syncingRef.current = "bar"
      tableScrollRef.current.scrollLeft = stickyBarRef.current.scrollLeft
    }
  }

  const needsHScroll = scrollWidth > clientWidth + 1

  return (
    <div className="border border-border/40 rounded-lg relative">
      <div
        ref={tableScrollRef}
        onScroll={handleTableScroll}
        className="overflow-x-auto [&_[data-slot=table-container]]:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
      <Table className="text-[11px] [&_th]:h-7 [&_th]:px-1.5 [&_th]:text-[11px] [&_td]:px-1.5 [&_td]:py-1">
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead className="w-[40px]"></TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Cost Category</TableHead>
            <TableHead>Cost Description</TableHead>
            <TableHead className="min-w-[110px] max-w-[140px]">Benchmark Match</TableHead>
            <TableHead>Unit Type</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Negotiated Price</TableHead>
            <TableHead className="min-w-[160px]">Benchmark</TableHead>
            <TableHead>Decision</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Flag</TableHead>
            <TableHead className="text-right">Variance</TableHead>
            <TableHead className="text-right">Number of Unit</TableHead>
            <TableHead className="text-right">Total Cost</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="min-w-[180px]">Comments</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparisons.map((comparison) => {
            const isExpanded = expandedRows.has(comparison.id)
            // Fallback to "To Assess" config if the decision string from the
            // backend isn't one of our canonical values (e.g. "n/a", or any
            // free-text from a hand-edited Excel). "To Assess" is the default.
            const decisionConf =
              decisionConfig[comparison.lineItem.decision] ??
              decisionConfig["To Assess"]
            const selectedValue = getBenchmarkValue(comparison) ?? 0
            const hasBenchmarkValue = selectedValue > 0
            const dynamicVariance = hasBenchmarkValue ? comparison.lineItem.unitPrice - selectedValue : 0
            const dynamicVariancePercent = hasBenchmarkValue ? (dynamicVariance / selectedValue) * 100 : 0
            const dynamicFlag: "GREEN" | "YELLOW" | "RED" = dynamicVariancePercent > 15 ? "RED" : dynamicVariancePercent > 5 ? "YELLOW" : "GREEN"
            // Only compute a variance-based flag when there's an actual benchmark
            // value to compare against. Otherwise fall back to the stored flag
            // (NO_MATCH / NO_BENCHMARK_DATA / NON_COMPARABLE / SKIPPED_BY_DECISION)
            // so we never falsely report "Within Range" for unmatched items.
            const computedFlags = new Set(["GREEN", "YELLOW", "RED"])
            const effectiveFlag = hasBenchmarkValue
              ? dynamicFlag
              : comparison.flag && !computedFlags.has(comparison.flag)
                ? comparison.flag
                : "NO_MATCH"
            const flagConf = flagConfig[effectiveFlag] || flagConfig["NO_MATCH"]

            const varianceIcon =
              dynamicVariance > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : dynamicVariance < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )

            // Resolve the Code from the benchmark match the user selected,
            // falling back to the top suggested match when none is explicitly chosen.
            const selectedMatch =
              (comparison.userSelected
                ? comparison.possibleMatches?.find((m: any) => m.benchmarkId === comparison.userSelected)
                : null) || comparison.possibleMatches?.[0]
            const selectedCode = (selectedMatch as any)?.code || null

            return (
              <Fragment key={comparison.id}>
                <TableRow className="border-border/40">
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => toggleRow(comparison.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {comparison.lineItem.country}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={comparison.lineItem.costCategory || ""}
                      onValueChange={(val) => handleCostCategoryChange(comparison.lineItem.id, val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] min-w-[140px] max-w-[180px] border-border/40">
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
                  <TableCell className="min-w-[220px] max-w-[320px]" onClick={(e) => e.stopPropagation()}>
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
                      <div className="text-[11px] font-medium whitespace-normal break-words flex-1">
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
                  <TableCell className="min-w-[110px] max-w-[140px]" onClick={(e) => e.stopPropagation()}>
                    {comparison.possibleMatches && comparison.possibleMatches.length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] w-full justify-start gap-2"
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
                      <span className="text-[11px] text-muted-foreground italic whitespace-normal break-words leading-tight block">
                        No match found
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground whitespace-normal break-words leading-tight block">
                        {comparison.benchmarkDescription || "Pending comparison"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {comparison.lineItem.unitType || "-"}
                  </TableCell>
                  <TableCell className="text-right font-medium font-mono">
                    {comparison.lineItem.unitPrice?.toLocaleString() ?? "-"}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="number"
                      value={
                        negotiatedPriceDrafts[comparison.lineItem.id] ??
                        (comparison.lineItem.negotiatedPrice ?? "").toString()
                      }
                      onChange={(e) => {
                        setNegotiatedPriceDrafts((prev) => ({
                          ...prev,
                          [comparison.lineItem.id]: e.target.value,
                        }))
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value
                        const value = raw === "" ? null : parseFloat(raw)
                        const current = comparison.lineItem.negotiatedPrice ?? null
                        // Only persist when the value actually changed.
                        if (value !== current && !(value === null && current === null)) {
                          onLineItemUpdate?.(comparison.lineItem.id, "negotiatedPrice", value as any)
                        }
                        // Drop the local draft so the input reflects canonical
                        // state again (e.g. after a re-run updates the value).
                        setNegotiatedPriceDrafts((prev) => {
                          const next = { ...prev }
                          delete next[comparison.lineItem.id]
                          return next
                        })
                      }}
                      placeholder="Enter price"
                      className="h-7 w-[110px] text-right font-mono text-[11px] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={comparison.selectedBenchmarkType}
                      onValueChange={(val) => onBenchmarkTypeChange?.(comparison.id, val as BenchmarkType)}
                    >
                      <SelectTrigger className="h-7 text-[11px] min-w-[160px] border-border/40">
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
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={comparison.lineItem.decision}
                      onOpenChange={(open) => {
                        if (open) {
                          decisionUserOpenRef.current.add(comparison.id)
                        }
                      }}
                      onValueChange={(val) => {
                        const wasUserOpened = decisionUserOpenRef.current.has(comparison.id)
                        if (!wasUserOpened) {
                          // Radix Select reconciliation echo (no user gesture). Suppress.
                          return
                        }
                        decisionUserOpenRef.current.delete(comparison.id)
                        if (val === comparison.lineItem.decision) return
                        onDecisionChange?.(comparison.id, val as ItemDecision)
                      }}
                    >
                      <SelectTrigger className={`h-6 text-[11px] font-medium border rounded-full px-2.5 min-w-[130px] ${decisionConf.color}`}>
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
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {comparison.lineItem.currency || "USD"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={flagConf?.color || "text-slate-400 bg-slate-400/10"} variant="outline">
                      {flagConf?.label || comparison.flag}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {hasBenchmarkValue ? (
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
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {comparison.lineItem.numberOfUnit ?? comparison.lineItem.numberOfUnits ?? "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {getEffectiveTotalCost(
                      negotiatedPriceDrafts[comparison.lineItem.id] !== undefined
                        ? {
                            ...comparison.lineItem,
                            negotiatedPrice:
                              negotiatedPriceDrafts[comparison.lineItem.id] === ""
                                ? null
                                : parseFloat(negotiatedPriceDrafts[comparison.lineItem.id]),
                          }
                        : comparison.lineItem,
                    ).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">
                    {selectedCode ? (
                      <Badge variant="outline" className="font-normal">
                        {selectedCode}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[180px] align-top" onClick={(e) => e.stopPropagation()}>
                    <Textarea
                      value={commentDrafts[comparison.lineItem.id] ?? comparison.lineItem.comment ?? ""}
                      onChange={(e) =>
                        setCommentDrafts((prev) => ({ ...prev, [comparison.lineItem.id]: e.target.value }))
                      }
                      onBlur={(e) => {
                        const value = e.target.value
                        if (value !== (comparison.lineItem.comment ?? "")) {
                          onLineItemUpdate?.(comparison.lineItem.id, "comment", value)
                        }
                      }}
                      placeholder="Add comment..."
                      rows={2}
                      className="min-h-[2.25rem] w-[180px] resize-y text-[11px] leading-tight"
                    />
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow className="border-border/40 bg-accent/30">
                    <TableCell colSpan={17}>
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
                  <Card className="border-accent/30 bg-accent/5">
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <Lightbulb className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-accent mb-1">
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
          <TableRow className="border-border/40 bg-muted/50 font-semibold hover:bg-muted/50">
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell className="font-bold">Grand Total</TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell></TableCell>
            <TableCell className="text-right font-bold font-mono">
              {formatCurrency(totalCostSum, primaryCurrency)}
            </TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableBody>
      </Table>
      </div>

      {/* Sticky horizontal scrollbar pinned to the bottom of the viewport so
          left/right scrolling is reachable at any vertical scroll position. */}
      {needsHScroll && (
        <div
          ref={stickyBarRef}
          onScroll={handleBarScroll}
          className="sticky bottom-0 z-20 overflow-x-auto rounded-b-lg border-t border-border/40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
          aria-hidden="true"
        >
          <div style={{ width: scrollWidth }} className="h-3" />
        </div>
      )}

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
                  <TableHead className="w-[35%]">Procedure Name</TableHead>
                  <TableHead className="w-[10%]">Code</TableHead>
                  <TableHead className="w-[12%]">Country</TableHead>
                  <TableHead className="text-right w-[10%]">P25 (Low)</TableHead>
                  <TableHead className="text-right w-[10%]">P50 (Med)</TableHead>
                  <TableHead className="text-right w-[10%]">P75 (High)</TableHead>
                  <TableHead className="text-right w-[8%]">P90</TableHead>
                  <TableHead className="w-[5%] text-center">Action</TableHead>
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
                      <Badge variant="secondary" className="text-xs font-mono">
                        {match.code || "-"}
                      </Badge>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
