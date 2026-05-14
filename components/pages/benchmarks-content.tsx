"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/lib/auth-context"
import type { BenchmarkFile, TrialPhase, BenchmarkSource } from "@/lib/types"
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Search,
  Filter,
  Download,
  Upload,
  X,
  Database,
  Globe,
  Stethoscope,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Trash2,
  AlertTriangle,
} from "lucide-react"
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
import { format } from "date-fns"
import { BenchmarkUploadDialog } from "@/components/benchmarks/upload-dialog"

const ALL_VALUE = "__all__"

// Only allowed phases - filter out Phase I, II, III
const ALLOWED_PHASES: TrialPhase[] = ["All Phases", "Phase IV"]

export function BenchmarksContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [countryFilter, setCountryFilter] = useState<string>(ALL_VALUE)
  const [indicationFilter, setIndicationFilter] = useState<string>(ALL_VALUE)
  const [phaseFilter, setPhaseFilter] = useState<string>(ALL_VALUE)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [benchmarkFiles, setBenchmarkFiles] = useState<BenchmarkFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedIndications, setExpandedIndications] = useState<Set<string>>(new Set())

  const isAdmin = user?.role === "ADMIN"

  const handleClearAllData = async () => {
    setIsClearing(true)
    try {
      const response = await fetch("/api/bm/clear", { method: "DELETE" })
      const result = await response.json()
      if (result.success) {
        setBenchmarkFiles([])
        setClearDialogOpen(false)
      } else {
        alert("Failed to clear data: " + result.error)
      }
    } catch (err: any) {
      alert("Error clearing data: " + err.message)
    } finally {
      setIsClearing(false)
    }
  }

  const toggleIndication = (indication: string) => {
    setExpandedIndications(prev => {
      const newSet = new Set(prev)
      if (newSet.has(indication)) {
        newSet.delete(indication)
      } else {
        newSet.add(indication)
      }
      return newSet
    })
  }

  const expandAll = () => {
    const allIndications = [...new Set(filteredBenchmarks.map(f => f.indication))]
    setExpandedIndications(new Set(allIndications))
  }

  const collapseAll = () => {
    setExpandedIndications(new Set())
  }

  // Fetch benchmark files from Supabase
  useEffect(() => {
    async function fetchBenchmarks() {
      setIsLoading(true)
      console.log("[v0] Fetching benchmarks, SUPABASE_URL exists:", !!process.env.NEXT_PUBLIC_SUPABASE_URL)
      try {
        const supabase = createClient()
        
        // Fetch ALL files using pagination to bypass 1000 row limit
        let allFiles: Record<string, unknown>[] = []
        let from = 0
        const pageSize = 1000
        let hasMore = true
        
        while (hasMore) {
          const { data, error } = await supabase
            .from("benchmark_files")
            .select("*")
            .order("uploaded_at", { ascending: false })
            .range(from, from + pageSize - 1)
          
          if (error) {
            console.error("[v0] Error fetching benchmarks:", error.message, error.code)
            setBenchmarkFiles([])
            return
          }
          
          console.log("[v0] Fetched batch:", data?.length || 0, "files, from:", from)
          
          if (data && data.length > 0) {
            allFiles = [...allFiles, ...data]
            from += pageSize
            hasMore = data.length === pageSize
          } else {
            hasMore = false
          }
        }
        
        
        
        if (allFiles.length === 0) {
          setBenchmarkFiles([])
        } else {
          // Map Supabase data to BenchmarkFile type
          const mappedFiles: BenchmarkFile[] = allFiles.map((row: Record<string, unknown>) => ({
            id: row.id as string,
            fileName: row.file_name as string,
            source: row.source as BenchmarkSource,
            country: row.country as string,
            indication: row.indication as string,
            indicationCode: (row.indication_code as string) || undefined,
            trialPhase: row.trial_phase as TrialPhase,
            procedureCount: row.procedure_count as number,
            currency: row.currency as string,
            uploadedAt: row.uploaded_at as string,
            uploadedBy: (row.uploaded_by as string) || "System",
          }))
          
          setBenchmarkFiles(mappedFiles)
        }
      } catch (err) {
        console.error("[v0] Fetch error:", err)
        setBenchmarkFiles([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchBenchmarks()
  }, [])

  // Extract unique values for filters
  const filterOptions = useMemo(() => {
    const countries = [...new Set(benchmarkFiles.map((r) => r.country))].sort()
    const indications = [...new Set(benchmarkFiles.map((r) => r.indication))].sort()
    const phases: TrialPhase[] = ALLOWED_PHASES
    return { countries, indications, phases }
  }, [benchmarkFiles])

  // Filter benchmarks - only show allowed phases
  const filteredBenchmarks = useMemo(() => {
    return benchmarkFiles.filter((file) => {
      // Only show All Phases and Phase IV
      if (!ALLOWED_PHASES.includes(file.trialPhase)) {
        return false
      }
      
      const matchesSearch =
        searchQuery === "" ||
        file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.indication.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.country.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCountry = countryFilter === ALL_VALUE || file.country === countryFilter
      const matchesIndication = indicationFilter === ALL_VALUE || file.indication === indicationFilter
      const matchesPhase = phaseFilter === ALL_VALUE || file.trialPhase === phaseFilter

      return matchesSearch && matchesCountry && matchesIndication && matchesPhase
    })
  }, [benchmarkFiles, searchQuery, countryFilter, indicationFilter, phaseFilter])

  // Group benchmarks by indication, then by phase
  const groupedBenchmarks = useMemo(() => {
    const groups: Record<string, Record<string, BenchmarkFile[]>> = {}
    
    for (const file of filteredBenchmarks) {
      if (!groups[file.indication]) {
        groups[file.indication] = {}
      }
      if (!groups[file.indication][file.trialPhase]) {
        groups[file.indication][file.trialPhase] = []
      }
      groups[file.indication][file.trialPhase].push(file)
    }
    
    // Sort indications: "All" first, then alphabetically. Then phases.
    const phaseOrder = ["All Phases", "Phase I", "Phase II", "Phase III", "Phase IV"]
    return Object.entries(groups)
      .sort(([a], [b]) => {
        // "All" indication should come first
        if (a === "All") return -1
        if (b === "All") return 1
        return a.localeCompare(b)
      })
      .map(([indication, phases]) => ({
        indication,
        phases: Object.entries(phases)
          .sort(([a], [b]) => phaseOrder.indexOf(a) - phaseOrder.indexOf(b))
          .map(([phase, files]) => ({ phase, files }))
      }))
  }, [filteredBenchmarks])

  const activeFilterCount = [countryFilter, indicationFilter, phaseFilter].filter(
    (f) => f !== ALL_VALUE
  ).length

  const clearFilters = () => {
    setCountryFilter(ALL_VALUE)
    setIndicationFilter(ALL_VALUE)
    setPhaseFilter(ALL_VALUE)
    setSearchQuery("")
  }

  const getSourceLabel = (source: BenchmarkSource) => {
    return source === "IQVIA_GRANTPLAN" ? "IQVIA GrantPlan" : "IQVIA GPI"
  }

  const getSourceBadgeVariant = (source: BenchmarkSource) => {
    return source === "IQVIA_GRANTPLAN" ? "default" : "secondary"
  }

  // Stats
  const stats = useMemo(() => {
    const uniqueCountries = new Set(benchmarkFiles.map((r) => r.country)).size
    const uniqueIndications = new Set(benchmarkFiles.map((r) => r.indication)).size
    const totalProcedures = benchmarkFiles.reduce((sum, f) => sum + f.procedureCount, 0)
    return {
      uniqueCountries,
      uniqueIndications,
      totalFiles: benchmarkFiles.length,
      totalProcedures,
    }
  }, [benchmarkFiles])

  return (
    <div className="p-8">
      {/* Upload Dialog - Admin only */}
      {isAdmin && (
        <BenchmarkUploadDialog 
          open={uploadDialogOpen} 
          onOpenChange={setUploadDialogOpen}
          onSuccess={async () => {
            // Refresh benchmark data after successful upload
            const supabase = createClient()
            const { data } = await supabase
              .from("benchmark_files")
              .select("*")
              .order("uploaded_at", { ascending: false })
            
            if (data) {
              const mappedFiles: BenchmarkFile[] = data.map((row: Record<string, unknown>) => ({
                id: row.id as string,
                fileName: row.file_name as string,
                source: row.source as BenchmarkSource,
                country: row.country as string,
                indication: row.indication as string,
                indicationCode: (row.indication_code as string) || undefined,
                trialPhase: row.trial_phase as TrialPhase,
                procedureCount: row.procedure_count as number,
                currency: row.currency as string,
                uploadedAt: row.uploaded_at as string,
                uploadedBy: (row.uploaded_by as string) || "System",
              }))
              setBenchmarkFiles(mappedFiles)
            }
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Benchmark Database</h1>
          <p className="text-muted-foreground mt-1">
            Browse and manage benchmark files from IQVIA GrantPlan and IQVIA GPI
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          {isAdmin && (
            <>
              <Button variant="destructive" size="sm" onClick={() => setClearDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Data
              </Button>
              <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Benchmark Data
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Benchmark Files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.totalFiles}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Countries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.uniqueCountries}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              Indications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.uniqueIndications}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Total Procedures
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.totalProcedures.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 bg-card/50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount} active
                </Badge>
              )}
            </CardTitle>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Country Filter */}
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All Countries</SelectItem>
                {filterOptions.countries.map((country) => (
                  <SelectItem key={country} value={country}>
                    {country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Indication Filter */}
            <Select value={indicationFilter} onValueChange={setIndicationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Indications" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All Indications</SelectItem>
                {filterOptions.indications.map((indication) => (
                  <SelectItem key={indication} value={indication}>
                    {indication}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Phase Filter */}
            <Select value={phaseFilter} onValueChange={setPhaseFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Phases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All Phases</SelectItem>
                {filterOptions.phases.map((phase) => (
                  <SelectItem key={phase} value={phase}>
                    {phase}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results - Grouped by Indication */}
      <Card className="bg-card/50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {filteredBenchmarks.length} benchmark file{filteredBenchmarks.length !== 1 ? "s" : ""}{" "}
              in {groupedBenchmarks.length} indication{groupedBenchmarks.length !== 1 ? "s" : ""}
            </CardTitle>
            {groupedBenchmarks.length > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={expandAll}>
                  Expand All
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                  Collapse All
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              Loading benchmark data...
            </div>
          ) : groupedBenchmarks.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              No benchmark files found. {isAdmin && "Upload benchmark data to get started."}
            </div>
          ) : (
            <div className="divide-y">
              {groupedBenchmarks.map(({ indication, phases }) => {
                const isIndicationExpanded = expandedIndications.has(indication)
                const allFiles = phases.flatMap(p => p.files)
                const totalProcedures = allFiles.reduce((sum, f) => sum + f.procedureCount, 0)
                const uniqueCountries = new Set(allFiles.map(f => f.country)).size
                return (
                  <Collapsible
                    key={indication}
                    open={isIndicationExpanded}
                    onOpenChange={() => toggleIndication(indication)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-center gap-4">
                          {isIndicationExpanded ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <h3 className="font-semibold text-base">{indication}</h3>
                            <p className="text-sm text-muted-foreground">
                              {uniqueCountries} countries | {totalProcedures.toLocaleString()} procedures | All Phases
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{phases.length} phase{phases.length !== 1 ? "s" : ""}</Badge>
                          <Badge variant="secondary">{allFiles.length} files</Badge>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pl-6 border-l-2 border-muted ml-6">
                        {phases.map(({ phase, files }) => {
                          const phaseKey = `${indication}-${phase}`
                          const isPhaseExpanded = expandedIndications.has(phaseKey)
                          const phaseProcedures = files.reduce((sum, f) => sum + f.procedureCount, 0)
                          const phaseCountries = new Set(files.map(f => f.country)).size
                          
                          return (
                            <Collapsible
                              key={phaseKey}
                              open={isPhaseExpanded}
                              onOpenChange={() => toggleIndication(phaseKey)}
                            >
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center justify-between p-3 hover:bg-muted/30 cursor-pointer transition-colors">
                                  <div className="flex items-center gap-3">
                                    {isPhaseExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <div>
                                      <h4 className="font-medium text-sm">{phase}</h4>
                                      <p className="text-xs text-muted-foreground">
                                        {phaseCountries} countries | {phaseProcedures.toLocaleString()} procedures
                                      </p>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">{files.length} files</Badge>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <Table>
                                  <TableHeader>
                                    <TableRow className="hover:bg-transparent bg-muted/20">
                                      <TableHead className="pl-10">Country</TableHead>
                                      <TableHead>Currency</TableHead>
                                      <TableHead>Source</TableHead>
                                      <TableHead className="text-right">Procedures</TableHead>
                                      <TableHead>Uploaded</TableHead>
                                      <TableHead className="w-[50px]" />
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {files.map((file) => (
                                      <TableRow
                                        key={file.id}
                                        className="cursor-pointer"
                                        onClick={() => router.push(`/benchmarks/${file.id}`)}
                                      >
                                        <TableCell className="pl-10 font-medium">{file.country}</TableCell>
                                        <TableCell>
                                          <Badge variant="outline">{file.currency}</Badge>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant={getSourceBadgeVariant(file.source)}>
                                            {getSourceLabel(file.source)}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                          {file.procedureCount}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                          {format(new Date(file.uploadedAt), "MMM d, yyyy")}
                                        </TableCell>
                                        <TableCell>
                                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CollapsibleContent>
                            </Collapsible>
                          )
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear All Data Confirmation Dialog */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Clear All Benchmark Data
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete ALL benchmark files and procedures from the database.
              This action cannot be undone. You will need to re-upload your benchmark files after clearing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAllData}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? "Clearing..." : "Clear All Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
