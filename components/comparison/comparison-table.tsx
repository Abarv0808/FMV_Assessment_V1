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
import { Textarea } from "@/components/ui/textarea"
import type { AssessmentComparison, BenchmarkType, ItemDecision } from "@/lib/types"

interface ComparisonTableProps {
  comparisons: AssessmentComparison[]
  onComparisonChange?: (id: string, field: "benchmarkDescription" | "comment", value: string) => void
  onBenchmarkTypeChange?: (id: string, benchmarkType: BenchmarkType) => void
  onDecisionChange?: (id: string, decision: ItemDecision) => void
  onMatchSelect?: (id: string, match: any) => void
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

export function ComparisonTable({ comparisons, onComparisonChange, onBenchmarkTypeChange, onDecisionChange, onMatchSelect }: ComparisonTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  
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
            <TableHead>Additional Information</TableHead>
            <TableHead className="min-w-[220px]">Benchmark Match</TableHead>
            <TableHead className="text-right">Number of Unit</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
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
                  <TableCell className="max-w-[300px]">
                    <div className="truncate font-medium">
                      {comparison.lineItem.additionalInformation || comparison.lineItem.description}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[250px]" onClick={(e) => e.stopPropagation()}>
                    {comparison.possibleMatches && comparison.possibleMatches.length > 1 ? (
                      <Select
                        value={comparison.userSelected || comparison.possibleMatches[0]?.benchmarkId || ""}
                        onValueChange={(val) => {
                          const selectedMatch = comparison.possibleMatches?.find((m: any) => m.benchmarkId === val)
                          if (selectedMatch && onMatchSelect) {
                            onMatchSelect(comparison.id, selectedMatch)
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs border-border/40">
                          <SelectValue placeholder="Select match..." />
                        </SelectTrigger>
                        <SelectContent>
                          {comparison.possibleMatches.map((match: any, idx: number) => (
                            <SelectItem key={match.benchmarkId || idx} value={match.benchmarkId || String(idx)}>
                              <div className="flex flex-col py-1">
                                <span className="text-xs font-medium truncate max-w-[200px]">{match.procedureName}</span>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round(match.similarity * 100)}% match
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : comparison.flag === "NO_MATCH" ? (
                      <span className="text-xs text-muted-foreground italic">No match found</span>
                    ) : comparison.possibleMatches && comparison.possibleMatches.length === 1 ? (
                      <span className="text-xs text-muted-foreground">
                        {comparison.possibleMatches[0].procedureName} ({Math.round(comparison.possibleMatches[0].similarity * 100)}%)
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {comparison.benchmarkDescription || "Pending comparison"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {comparison.lineItem.numberOfUnit ?? comparison.lineItem.numberOfUnits ?? "-"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(
                      comparison.lineItem.unitPrice,
                      comparison.lineItem.currency || "USD"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {comparison.lineItem.totalCost 
                      ? formatCurrency(comparison.lineItem.totalCost, comparison.lineItem.currency || "USD")
                      : "-"}
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
                      onValueChange={(val) => onDecisionChange?.(comparison.id, val as ItemDecision)}
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
    </div>
  )
}
