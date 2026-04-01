"use client"

import type React from "react"
import { useCallback, useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Upload, FileText, X, FileSpreadsheet, Database, ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { BenchmarkFile, BenchmarkSource, TrialPhase } from "@/lib/types"
import { format } from "date-fns"

interface ProposalUploadStepProps {
  data: {
    vendorProposal: File | null
    benchmarkFile: File | null
    benchmarkSource: "grantplan" | "grantsmanager" | null
    selectedBenchmarkFileId: string | null
    selectedBenchmarkFileIds?: string[]
  }
  onChange: (data: Partial<ProposalUploadStepProps["data"]>) => void
}

export function ProposalUploadStep({ data, onChange }: ProposalUploadStepProps) {
  const [benchmarkFiles, setBenchmarkFiles] = useState<BenchmarkFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedIndications, setExpandedIndications] = useState<Set<string>>(new Set())

  // Fetch benchmark files from Supabase
  useEffect(() => {
    async function fetchBenchmarks() {
      if (!data.benchmarkSource) return
      
      setIsLoading(true)
      try {
        const supabase = createClient()
        const sourceValue = data.benchmarkSource === "grantplan" ? "IQVIA_GRANTPLAN" : "IQVIA_GPI_GRANTSMANAGER"
        
        // Fetch ALL files using pagination to bypass 1000 row limit
        let allFiles: Record<string, unknown>[] = []
        let from = 0
        const pageSize = 1000
        let hasMore = true
        
        while (hasMore) {
          const { data: fetchedData, error } = await supabase
            .from("benchmark_files")
            .select("*")
            .eq("source", sourceValue)
            .order("indication", { ascending: true })
            .range(from, from + pageSize - 1)
          
          if (error) {
            console.error("[v0] Error fetching benchmarks:", error)
            setBenchmarkFiles([])
            return
          }
          
          if (fetchedData && fetchedData.length > 0) {
            allFiles = [...allFiles, ...fetchedData]
            from += pageSize
            hasMore = fetchedData.length === pageSize
          } else {
            hasMore = false
          }
        }
        
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
      } catch (err) {
        console.error("[v0] Fetch error:", err)
        setBenchmarkFiles([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchBenchmarks()
  }, [data.benchmarkSource])

  // Group benchmarks by indication, then by phase
  const groupedBenchmarks = useMemo(() => {
    const groups: Record<string, Record<string, BenchmarkFile[]>> = {}
    
    for (const file of benchmarkFiles) {
      if (!groups[file.indication]) {
        groups[file.indication] = {}
      }
      if (!groups[file.indication][file.trialPhase]) {
        groups[file.indication][file.trialPhase] = []
      }
      groups[file.indication][file.trialPhase].push(file)
    }
    
    const phaseOrder = ["Phase I", "Phase II", "Phase III", "Phase IV"]
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([indication, phases]) => ({
        indication,
        phases: Object.entries(phases)
          .sort(([a], [b]) => phaseOrder.indexOf(a) - phaseOrder.indexOf(b))
          .map(([phase, files]) => ({ phase, files }))
      }))
  }, [benchmarkFiles])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
  }

  const handleVendorFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null
      onChange({ vendorProposal: file })
    },
    [onChange],
  )

  const handleVendorDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0] || null
      onChange({ vendorProposal: file })
    },
    [onChange],
  )

  const handleBenchmarkFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null
      if (file) {
        const filename = file.name.toLowerCase()
        let source: "grantplan" | "grantsmanager" | null = null
        if (filename.includes("grantplan") || filename.includes("iqvia")) {
          source = "grantplan"
        } else if (filename.includes("grantsmanager") || filename.includes("gpi")) {
          source = "grantsmanager"
        }
        onChange({ benchmarkFile: file, benchmarkSource: source })
      }
    },
    [onChange],
  )

  const handleBenchmarkDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0] || null
      if (file) {
        const filename = file.name.toLowerCase()
        let source: "grantplan" | "grantsmanager" | null = null
        if (filename.includes("grantplan") || filename.includes("iqvia")) {
          source = "grantplan"
        } else if (filename.includes("grantsmanager") || filename.includes("gpi")) {
          source = "grantsmanager"
        }
        onChange({ benchmarkFile: file, benchmarkSource: source })
      }
    },
    [onChange],
  )

  const selectBenchmarkSource = (source: "grantplan" | "grantsmanager") => {
    onChange({ 
      benchmarkSource: source, 
      selectedBenchmarkFileId: null, 
      selectedBenchmarkFileIds: [],
      benchmarkFile: null 
    })
  }

  const toggleIndication = (key: string) => {
    setExpandedIndications(prev => {
      const newSet = new Set(prev)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return newSet
    })
  }

  const expandAll = () => {
    const allKeys: string[] = []
    groupedBenchmarks.forEach(({ indication, phases }) => {
      allKeys.push(indication)
      phases.forEach(({ phase }) => {
        allKeys.push(`${indication}-${phase}`)
      })
    })
    setExpandedIndications(new Set(allKeys))
  }

  const collapseAll = () => {
    setExpandedIndications(new Set())
  }

  // Multi-select handlers
  const selectedIds = data.selectedBenchmarkFileIds || []

  const toggleFileSelection = (fileId: string) => {
    const newIds = selectedIds.includes(fileId)
      ? selectedIds.filter(id => id !== fileId)
      : [...selectedIds, fileId]
    onChange({ selectedBenchmarkFileIds: newIds, selectedBenchmarkFileId: newIds[0] || null })
  }

  const toggleAllFilesInPhase = (files: BenchmarkFile[]) => {
    const fileIds = files.map(f => f.id)
    const allSelected = fileIds.every(id => selectedIds.includes(id))
    
    if (allSelected) {
      // Deselect all files in this phase
      const newIds = selectedIds.filter(id => !fileIds.includes(id))
      onChange({ selectedBenchmarkFileIds: newIds, selectedBenchmarkFileId: newIds[0] || null })
    } else {
      // Select all files in this phase
      const newIds = [...new Set([...selectedIds, ...fileIds])]
      onChange({ selectedBenchmarkFileIds: newIds, selectedBenchmarkFileId: newIds[0] || null })
    }
  }

  const toggleAllFilesInIndication = (indication: string) => {
    const indicationGroup = groupedBenchmarks.find(g => g.indication === indication)
    if (!indicationGroup) return
    
    const fileIds = indicationGroup.phases.flatMap(p => p.files.map(f => f.id))
    const allSelected = fileIds.every(id => selectedIds.includes(id))
    
    if (allSelected) {
      const newIds = selectedIds.filter(id => !fileIds.includes(id))
      onChange({ selectedBenchmarkFileIds: newIds, selectedBenchmarkFileId: newIds[0] || null })
    } else {
      const newIds = [...new Set([...selectedIds, ...fileIds])]
      onChange({ selectedBenchmarkFileIds: newIds, selectedBenchmarkFileId: newIds[0] || null })
    }
  }

  const isGrantPlan = data.benchmarkSource === "grantplan"

  return (
    <div className="space-y-8">
      {/* Vendor Proposal Upload */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Vendor Proposal</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload the vendor's proposal file containing their rate card and service fees.
        </p>

        {!data.vendorProposal ? (
          <div
            onDrop={handleVendorDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => document.getElementById("vendor-file-upload")?.click()}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-accent p-3">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx, .xls) or CSV files</p>
              </div>
              <Button type="button" variant="secondary" size="sm">
                Browse Files
              </Button>
            </div>
            <input
              id="vendor-file-upload"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleVendorFileChange}
              className="hidden"
            />
          </div>
        ) : (
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded bg-primary/10 p-2">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{data.vendorProposal.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(data.vendorProposal.size)}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onChange({ vendorProposal: null })}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Benchmark File Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Benchmark Data</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Select benchmark data from IQVIA GrantPlan or IQVIA GPI for comparison.
        </p>

        {/* Benchmark Source Selection */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Data Source:</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={data.benchmarkSource === "grantplan" ? "default" : "outline"}
              size="sm"
              onClick={() => selectBenchmarkSource("grantplan")}
            >
              IQVIA GrantPlan
            </Button>
            <Button
              type="button"
              variant={data.benchmarkSource === "grantsmanager" ? "default" : "outline"}
              size="sm"
              onClick={() => selectBenchmarkSource("grantsmanager")}
            >
              IQVIA GPI
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="h-32 flex items-center justify-center text-muted-foreground">
            Loading benchmark files...
          </div>
        )}

        {/* IQVIA GrantPlan: Collapsible sections with multi-select */}
        {isGrantPlan && !isLoading && groupedBenchmarks.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">
                  Select Indication Files for Comparison
                </p>
                {selectedIds.length > 0 && (
                  <Badge variant="secondary">{selectedIds.length} selected</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={expandAll}>
                  Expand All
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                  Collapse All
                </Button>
              </div>
            </div>

            <Card className="border-border/40">
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {groupedBenchmarks.map(({ indication, phases }) => {
                  const isIndicationExpanded = expandedIndications.has(indication)
                  const allFiles = phases.flatMap(p => p.files)
                  const totalProcedures = allFiles.reduce((sum, f) => sum + f.procedureCount, 0)
                  const uniqueCountries = new Set(allFiles.map(f => f.country)).size
                  const phaseNames = phases.map(p => p.phase).join(", ")
                  const allIndicationFilesSelected = allFiles.every(f => selectedIds.includes(f.id))
                  const someIndicationFilesSelected = allFiles.some(f => selectedIds.includes(f.id))
                  
                  return (
                    <Collapsible
                      key={indication}
                      open={isIndicationExpanded}
                      onOpenChange={() => toggleIndication(indication)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors">
                          <div className="flex items-center gap-4">
                            <Checkbox
                              checked={allIndicationFilesSelected}
                              className={cn(someIndicationFilesSelected && !allIndicationFilesSelected && "data-[state=unchecked]:bg-primary/30")}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleAllFilesInIndication(indication)
                              }}
                            />
                            {isIndicationExpanded ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                              <h3 className="font-semibold text-base">{indication}</h3>
                              <p className="text-sm text-muted-foreground">
                                {uniqueCountries} countries | {totalProcedures.toLocaleString()} procedures | {phaseNames}
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
                            const allPhaseFilesSelected = files.every(f => selectedIds.includes(f.id))
                            const somePhaseFilesSelected = files.some(f => selectedIds.includes(f.id))
                            
                            return (
                              <Collapsible
                                key={phaseKey}
                                open={isPhaseExpanded}
                                onOpenChange={() => toggleIndication(phaseKey)}
                              >
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between p-3 hover:bg-muted/30 cursor-pointer transition-colors">
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        checked={allPhaseFilesSelected}
                                        className={cn(somePhaseFilesSelected && !allPhaseFilesSelected && "data-[state=unchecked]:bg-primary/30")}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          toggleAllFilesInPhase(files)
                                        }}
                                      />
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
                                        <TableHead className="w-[50px] pl-10"></TableHead>
                                        <TableHead>Country</TableHead>
                                        <TableHead>Currency</TableHead>
                                        <TableHead className="text-right">Procedures</TableHead>
                                        <TableHead>Uploaded</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {files.map((file) => {
                                        const isSelected = selectedIds.includes(file.id)
                                        return (
                                          <TableRow
                                            key={file.id}
                                            className={cn(
                                              "cursor-pointer",
                                              isSelected && "bg-primary/5"
                                            )}
                                            onClick={() => toggleFileSelection(file.id)}
                                          >
                                            <TableCell className="pl-10">
                                              <Checkbox
                                                checked={isSelected}
                                                onClick={(e) => e.stopPropagation()}
                                                onCheckedChange={() => toggleFileSelection(file.id)}
                                              />
                                            </TableCell>
                                            <TableCell className="font-medium">{file.country}</TableCell>
                                            <TableCell>
                                              <Badge variant="outline">{file.currency}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                              {file.procedureCount}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                              {format(new Date(file.uploadedAt), "MMM d, yyyy")}
                                            </TableCell>
                                          </TableRow>
                                        )
                                      })}
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
            </Card>
          </div>
        )}

        {/* IQVIA GPI: Simple file list (existing behavior) */}
        {data.benchmarkSource === "grantsmanager" && !isLoading && benchmarkFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Available Benchmark Files</p>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {benchmarkFiles.map((file) => {
                const isSelected = data.selectedBenchmarkFileId === file.id
                return (
                  <div
                    key={file.id}
                    onClick={() => onChange({ selectedBenchmarkFileId: file.id, selectedBenchmarkFileIds: [file.id] })}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/40 hover:bg-accent/50"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center h-9 w-9 rounded-full shrink-0",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
                    )}>
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-medium truncate", isSelected && "text-primary")}>{file.fileName || `${file.indication} - ${file.country}`}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {file.country} &middot; {file.indication} &middot; {file.trialPhase} &middot; {file.procedureCount} procedures
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {file.currency}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {data.benchmarkSource && !isLoading && benchmarkFiles.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
            No benchmark files available for this data source.
          </p>
        )}

        

        {/* Uploaded file display */}
        {data.benchmarkFile && selectedIds.length === 0 && !data.selectedBenchmarkFileId && (
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded bg-primary/10 p-2">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{data.benchmarkFile.name}</p>
                    {data.benchmarkSource && (
                      <Badge variant="secondary" className="text-xs">
                        {data.benchmarkSource === "grantplan" ? "IQVIA GrantPlan" : "IQVIA GPI"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatFileSize(data.benchmarkFile.size)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onChange({ benchmarkFile: null, benchmarkSource: null })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Selected files summary */}
        {selectedIds.length > 0 && (
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded bg-primary/10 p-2">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {selectedIds.length} benchmark file{selectedIds.length !== 1 ? "s" : ""} selected
                  </p>
                  <p className="text-xs text-muted-foreground">
                    These files will be used for vendor comparison
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ selectedBenchmarkFileIds: [], selectedBenchmarkFileId: null })}
              >
                Clear Selection
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
