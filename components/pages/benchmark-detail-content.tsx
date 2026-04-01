"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { mockBenchmarkFiles, mockBenchmarkProcedures } from "@/lib/mock-data"
import type { BenchmarkProcedure, ProcedureSourceType, BenchmarkSource } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Search,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Globe,
  Stethoscope,
  FlaskConical,
  DollarSign,
  Calendar,
  User,
  Building2,
} from "lucide-react"
import { format } from "date-fns"

const ALL_VALUE = "__all__"

interface BenchmarkDetailContentProps {
  benchmarkId: string
}

export function BenchmarkDetailContent({ benchmarkId }: BenchmarkDetailContentProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>(ALL_VALUE)

  // Find the benchmark file
  const benchmarkFile = mockBenchmarkFiles.find((f) => f.id === benchmarkId)

  // Get procedures for this benchmark
  const allProcedures = mockBenchmarkProcedures.filter((p) => p.benchmarkFileId === benchmarkId)

  // Filter procedures
  const filteredProcedures = useMemo(() => {
    return allProcedures.filter((proc) => {
      const matchesSearch =
        searchQuery === "" ||
        proc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        proc.procedure.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesSourceType =
        sourceTypeFilter === ALL_VALUE || proc.sourceType === sourceTypeFilter

      return matchesSearch && matchesSourceType
    })
  }, [allProcedures, searchQuery, sourceTypeFilter])

  if (!benchmarkFile) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Benchmark not found</h2>
          <p className="text-muted-foreground mb-4">
            The benchmark file you're looking for doesn't exist.
          </p>
          <Button onClick={() => router.push("/benchmarks")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Benchmarks
          </Button>
        </div>
      </div>
    )
  }

  const formatCurrency = (amount: number | undefined, currency: string) => {
    if (amount === undefined) return "-"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const getSourceTypeLabel = (type: ProcedureSourceType) => {
    switch (type) {
      case "A":
        return "Actual"
      case "PL":
        return "Price List"
      case "E":
        return "Excluded"
    }
  }

  const getSourceTypeBadgeVariant = (type: ProcedureSourceType) => {
    switch (type) {
      case "A":
        return "default"
      case "PL":
        return "secondary"
      case "E":
        return "outline"
    }
  }

  const getSourceLabel = (source: BenchmarkSource) => {
    return source === "IQVIA_GRANTPLAN" ? "IQVIA GrantPlan" : "IQVIA GPI"
  }

  // Calculate totals
  const totalCost = allProcedures.reduce((sum, p) => sum + p.total, 0)
  const avgMedian =
    allProcedures.reduce((sum, p) => sum + (p.industryMed || 0), 0) / allProcedures.length

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2"
            onClick={() => router.push("/benchmarks")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Benchmarks
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{benchmarkFile.indication}</h1>
          <p className="text-muted-foreground mt-1">
            {benchmarkFile.country} - {benchmarkFile.trialPhase} - {benchmarkFile.currency}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Metadata Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Country
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{benchmarkFile.country}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Indication
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold line-clamp-1">{benchmarkFile.indication}</p>
            {benchmarkFile.indicationCode && (
              <p className="text-xs text-muted-foreground">{benchmarkFile.indicationCode}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Trial Phase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{benchmarkFile.trialPhase}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Currency
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{benchmarkFile.currency}</p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Info */}
      <Card className="mb-6 bg-card/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">File Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">File Name</p>
                <p className="font-medium text-sm">{benchmarkFile.fileName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Source</p>
                <p className="font-medium text-sm">{getSourceLabel(benchmarkFile.source)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Uploaded</p>
                <p className="font-medium text-sm">
                  {format(new Date(benchmarkFile.uploadedAt), "MMM d, yyyy")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Uploaded By</p>
                <p className="font-medium text-sm">{benchmarkFile.uploadedBy}</p>
              </div>
            </div>
          </div>
          {(benchmarkFile.studyCode ||
            benchmarkFile.patientType ||
            benchmarkFile.overheadPercent) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-6 pt-6 border-t border-border">
              {benchmarkFile.studyCode && (
                <div>
                  <p className="text-sm text-muted-foreground">Study Code</p>
                  <p className="font-medium text-sm">{benchmarkFile.studyCode}</p>
                </div>
              )}
              {benchmarkFile.patientType && (
                <div>
                  <p className="text-sm text-muted-foreground">Patient Type</p>
                  <p className="font-medium text-sm">{benchmarkFile.patientType}</p>
                </div>
              )}
              {benchmarkFile.budgetType && (
                <div>
                  <p className="text-sm text-muted-foreground">Budget Type</p>
                  <p className="font-medium text-sm">{benchmarkFile.budgetType}</p>
                </div>
              )}
              {benchmarkFile.overheadPercent !== undefined && (
                <div>
                  <p className="text-sm text-muted-foreground">Overhead</p>
                  <p className="font-medium text-sm">{benchmarkFile.overheadPercent}%</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Total Procedures</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{allProcedures.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Total Cost</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatCurrency(totalCost, benchmarkFile.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription>Avg Industry Median</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatCurrency(avgMedian, benchmarkFile.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="mb-6 bg-card/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Procedures</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search procedures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Source Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All Source Types</SelectItem>
                <SelectItem value="A">Actual (A)</SelectItem>
                <SelectItem value="PL">Price List (PL)</SelectItem>
                <SelectItem value="E">Excluded (E)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Procedures Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px]">Code</TableHead>
                  <TableHead>Procedure</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Low</TableHead>
                  <TableHead className="text-right">Med</TableHead>
                  <TableHead className="text-right">High</TableHead>
                  <TableHead className="text-right">90th</TableHead>
                  <TableHead className="text-center">Src</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProcedures.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      No procedures found matching your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProcedures.map((proc) => (
                    <TableRow key={proc.id}>
                      <TableCell className="font-mono text-sm">{proc.code}</TableCell>
                      <TableCell className="max-w-[250px]">
                        <span className="line-clamp-1">{proc.procedure}</span>
                      </TableCell>
                      <TableCell className="text-right">{proc.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(proc.cost, benchmarkFile.currency)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(proc.total, benchmarkFile.currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(proc.industryLow, benchmarkFile.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(proc.industryMed, benchmarkFile.currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(proc.industryHigh, benchmarkFile.currency)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary">
                        {formatCurrency(proc.industry90th, benchmarkFile.currency)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={getSourceTypeBadgeVariant(proc.sourceType)}>
                          {proc.sourceType}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filteredProcedures.length > 0 && (
            <p className="text-sm text-muted-foreground mt-4">
              Showing {filteredProcedures.length} of {allProcedures.length} procedures
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
