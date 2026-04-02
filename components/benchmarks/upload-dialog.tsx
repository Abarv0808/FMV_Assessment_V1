"use client"

import { useState, useCallback } from "react"
import * as XLSX from "xlsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const INDICATIONS = [
  "Alpha-1 Antitrypsin",
  "Cataplexy and Narcolepsy",
  "Fabry",
  "Gaucher",
  "HAE and Transplant",
  "IBD",
  "Psoriasis",
  "Unspecified coagulation defect",
  "von Willebrand",
] as const

type Indication = typeof INDICATIONS[number]

interface ParsedProcedure {
  code: string
  name: string
  category: string
  p25: number | null
  p50: number | null
  p75: number | null
  p90: number | null
  p100: number | null
}

interface ParsedCountry {
  country: string
  currency: string
  procedures: ParsedProcedure[]
}

interface PreviewData {
  countries: ParsedCountry[]
}

interface UploadStats {
  countriesProcessed: number
  proceduresInserted: number
  proceduresDeleted: number
  benchmarkFilesCreated: number
  errors: string[]
}

interface BenchmarkUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

// Metadata labels to filter out (not actual procedures)
const METADATA_LABELS = [
  'study details', 'study code:', 'short name:', 'drug / compound:', 'title:', 
  'phase:', 'created:', 'modified:', 'budget type:', 'patient type:', 'indications',
  'study type', 'visits:', 'screened:', 'sites:', 'overhead:', 'lab costs:',
  'country details', 'single patient duration:', 'icd code', 'sub-studies',
  'screened per site:', 'grant negotiator:', 'budget column', 'study population type',
  'countries:', 'code', 'procedure name', 'name', 'sub total', 'total'
]

function isMetadataRow(name: string): boolean {
  const lower = name.toLowerCase().trim()
  return METADATA_LABELS.some(label => lower === label || lower.includes(label))
}

function parseNumber(val: any): number | null {
  if (val === null || val === undefined || val === "") return null
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[,$]/g, ""))
  return isNaN(num) ? null : num
}

// Client-side Excel parser for IQVIA GrantPlan format
// Headers: Code | Procedure | Qty | OH | Total | Low | Med | High | 90th | 100th | Src
function parseExcelFile(buffer: ArrayBuffer): ParsedCountry[] {
  const workbook = XLSX.read(buffer, { type: "array" })
  const countries: ParsedCountry[] = []
  
  for (const sheetName of workbook.SheetNames) {
    // Skip summary/ALL sheets
    if (sheetName.toLowerCase() === "all" || sheetName.toLowerCase() === "summary") {
      continue
    }
    
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    
    if (rows.length < 2) continue
    
    const procedures: ParsedProcedure[] = []
    let currentCategory = "Procedures"
    
    // Find header row with "Code", "Procedure", "Low", "Med", "High", "90th"
    let headerRowIdx = -1
    let codeCol = 0, procCol = 1, lowCol = -1, medCol = -1, highCol = -1, p90Col = -1, p100Col = -1
    
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
      const row = rows[i]
      if (!row) continue
      
      let foundLow = false, foundMed = false, foundHigh = false, found90 = false
      
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || "").toLowerCase().trim()
        if (cell === "code") codeCol = j
        if (cell === "procedure") procCol = j
        if (cell === "low") { lowCol = j; foundLow = true }
        if (cell === "med") { medCol = j; foundMed = true }
        if (cell === "high") { highCol = j; foundHigh = true }
        if (cell === "90th") { p90Col = j; found90 = true }
        if (cell === "100th") p100Col = j
      }
      
      // Found the header row when we see Low, Med, High, 90th
      if (foundLow && foundMed && foundHigh && found90) {
        headerRowIdx = i
        break
      }
    }
    
    if (headerRowIdx < 0) continue // No valid header found
    
    // Parse data rows after header
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue
      
      const codeCell = String(row[codeCol] || "").trim()
      const procCell = String(row[procCol] || "").trim()
      
      // Detect category headers
      const codeLower = codeCell.toLowerCase()
      if (codeLower.match(/^procedures?\s*\(\d+\)/)) { currentCategory = "Procedures"; continue }
      if (codeLower.match(/^non.?procedures?\s*\(\d+\)/)) { currentCategory = "Non-Procedures"; continue }
      if (codeLower.match(/^site\s*costs?\s*\(\d+\)/)) { currentCategory = "Site Costs"; continue }
      
      // Skip metadata, empty, or subtotal rows
      if (!procCell || procCell.length < 3) continue
      if (isMetadataRow(codeCell) || isMetadataRow(procCell)) continue
      if (codeLower.includes("sub total") || codeLower.includes("subtotal")) continue
      
      // Extract pricing: Low=P25, Med=P50, High=P75, 90th=P90, 100th=P100
      const low = parseNumber(row[lowCol])
      const med = parseNumber(row[medCol])
      const high = parseNumber(row[highCol])
      const p90 = parseNumber(row[p90Col])
      const p100 = p100Col >= 0 ? parseNumber(row[p100Col]) : null
      
      if (procCell.length > 2 && procCell.length < 500) {
        procedures.push({
          code: codeCell,
          name: procCell,
          category: currentCategory,
          p25: low,
          p50: med,
          p75: high,
          p90: p90,
          p100: p100
        })
      }
    }
    
    if (procedures.length > 0) {
      countries.push({
        country: sheetName,
        currency: "USD",
        procedures
      })
    }
  }
  
  return countries
}

interface FileWithMeta {
  file: File
  indication: Indication
  trialPhase: "All Phases" | "Phase 4"
  parsedCountries: ParsedCountry[]
  status: "pending" | "uploading" | "done" | "error"
  error?: string
}

export function BenchmarkUploadDialog({ open, onOpenChange, onSuccess }: BenchmarkUploadDialogProps) {
  const [files, setFiles] = useState<FileWithMeta[]>([])
  const [dataSource, setDataSource] = useState<"IQVIA GrantPlan" | "IQVIA GPI">("IQVIA GrantPlan")
  const [step, setStep] = useState<"upload" | "preview" | "uploading" | "complete">("upload")
  const [progress, setProgress] = useState(0)
  const [totalStats, setTotalStats] = useState<UploadStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const resetState = useCallback(() => {
    setFiles([])
    setDataSource("IQVIA GrantPlan")
    setStep("upload")
    setProgress(0)
    setTotalStats(null)
    setIsLoading(false)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onOpenChange(false)
  }, [resetState, onOpenChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
    )
    addFiles(droppedFiles)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    addFiles(selectedFiles)
    e.target.value = "" // Reset input
  }, [])

  const addFiles = async (newFiles: File[]) => {
    setIsLoading(true)
    const newFilesMeta: FileWithMeta[] = []
    
    for (const file of newFiles) {
      try {
        const buffer = await file.arrayBuffer()
        const countries = parseExcelFile(buffer)
        
        // Try to detect indication and phase from filename
        let detectedIndication: Indication = "Gaucher"
        let detectedPhase: "All Phases" | "Phase 4" = "All Phases"
        
        const lowerName = file.name.toLowerCase()
        for (const ind of INDICATIONS) {
          if (lowerName.includes(ind.toLowerCase().replace(/\s+/g, "")) || 
              lowerName.includes(ind.toLowerCase())) {
            detectedIndication = ind
            break
          }
        }
        if (lowerName.includes("phase4") || lowerName.includes("phase 4") || lowerName.includes("p4")) {
          detectedPhase = "Phase 4"
        }
        
        newFilesMeta.push({
          file,
          indication: detectedIndication,
          trialPhase: detectedPhase,
          parsedCountries: countries,
          status: "pending"
        })
      } catch (err) {
        newFilesMeta.push({
          file,
          indication: "Gaucher",
          trialPhase: "All Phases",
          parsedCountries: [],
          status: "error",
          error: "Failed to parse file"
        })
      }
    }
    
    setFiles(prev => [...prev, ...newFilesMeta])
    setIsLoading(false)
  }

  const updateFileIndication = (index: number, indication: Indication) => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, indication } : f))
  }

  const updateFilePhase = (index: number, phase: "All Phases" | "Phase 4") => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, trialPhase: phase } : f))
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handlePreview = useCallback(() => {
    if (files.length === 0) return
    
    // Check all files have valid data
    const hasValidFiles = files.some(f => f.parsedCountries.length > 0)
    if (!hasValidFiles) {
      alert("No valid data found in any files")
      return
    }
    
    setStep("preview")
  }, [files])

  const handleUploadAll = useCallback(async () => {
    const validFiles = files.filter(f => f.parsedCountries.length > 0 && f.status !== "error")
    if (validFiles.length === 0) return
    
    setStep("uploading")
    setProgress(0)
    
    const stats: UploadStats = {
      countriesProcessed: 0,
      proceduresInserted: 0,
      proceduresDeleted: 0,
      benchmarkFilesCreated: 0,
      errors: []
    }
    
    for (let i = 0; i < validFiles.length; i++) {
      const fileMeta = validFiles[i]
      const fileIndex = files.findIndex(f => f.file === fileMeta.file)
      
      setFiles(prev => prev.map((f, idx) => 
        idx === fileIndex ? { ...f, status: "uploading" } : f
      ))
      
      try {
        const response = await fetch("/api/bm/store", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            countries: fileMeta.parsedCountries,
            indication: fileMeta.indication,
            dataSource,
            trialPhase: fileMeta.trialPhase,
            uploadMode: "replace",
          })
        })
        
        const data = await response.json()
        
        if (data.success && data.stats) {
          stats.countriesProcessed += data.stats.countriesProcessed || 0
          stats.proceduresInserted += data.stats.proceduresInserted || 0
          stats.benchmarkFilesCreated += data.stats.benchmarkFilesCreated || 0
          
          setFiles(prev => prev.map((f, idx) => 
            idx === fileIndex ? { ...f, status: "done" } : f
          ))
        } else {
          stats.errors.push(`${fileMeta.file.name}: ${data.error || "Upload failed"}`)
          setFiles(prev => prev.map((f, idx) => 
            idx === fileIndex ? { ...f, status: "error", error: data.error } : f
          ))
        }
      } catch (err: any) {
        stats.errors.push(`${fileMeta.file.name}: ${err.message}`)
        setFiles(prev => prev.map((f, idx) => 
          idx === fileIndex ? { ...f, status: "error", error: err.message } : f
        ))
      }
      
      setProgress(Math.round(((i + 1) / validFiles.length) * 100))
    }
    
    setTotalStats(stats)
    setStep("complete")
    onSuccess?.()
  }, [files, dataSource, onSuccess])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Benchmark Data</DialogTitle>
          <DialogDescription>
            Upload IQVIA benchmark Excel files to update benchmark data.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6 py-4">
            {/* Drop zone - always visible */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById("bm-file-input")?.click()}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Drop files here or click to browse</p>
                  <p className="text-xs text-muted-foreground">Upload multiple Excel files at once</p>
                </div>
              </div>
              <input
                id="bm-file-input"
                type="file"
                accept=".xlsx,.xls"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                <Label>Files to Upload ({files.length})</Label>
                {files.map((fileMeta, index) => (
                  <Card key={index} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded bg-primary/10 p-2 shrink-0">
                        <FileSpreadsheet className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{fileMeta.file.name}</p>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(index)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{fileMeta.parsedCountries.length} countries</span>
                          <span>•</span>
                          <span>{fileMeta.parsedCountries.reduce((sum, c) => sum + c.procedures.length, 0)} procedures</span>
                          {fileMeta.parsedCountries.some(c => c.procedures.some(p => p.p90 !== null)) && (
                            <>
                              <span>•</span>
                              <Badge variant="outline" className="text-xs h-5">Has Pricing</Badge>
                            </>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Indication *</Label>
                            <Select 
                              value={fileMeta.indication} 
                              onValueChange={(val) => updateFileIndication(index, val as Indication)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select indication" />
                              </SelectTrigger>
                              <SelectContent>
                                {INDICATIONS.map(ind => (
                                  <SelectItem key={ind} value={ind} className="text-xs">{ind}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Trial Phase *</Label>
                            <Select 
                              value={fileMeta.trialPhase} 
                              onValueChange={(val) => updateFilePhase(index, val as "All Phases" | "Phase 4")}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="All Phases" className="text-xs">All Phases</SelectItem>
                                <SelectItem value="Phase 4" className="text-xs">Phase 4</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>Data Source</Label>
              <RadioGroup 
                value={dataSource} 
                onValueChange={(val) => setDataSource(val as "IQVIA GrantPlan" | "IQVIA GPI")}
                className="flex gap-4"
              >
                <div className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border cursor-pointer flex-1",
                  dataSource === "IQVIA GrantPlan" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
                )}>
                  <RadioGroupItem value="IQVIA GrantPlan" id="gp" />
                  <Label htmlFor="gp" className="cursor-pointer font-medium">IQVIA GrantPlan</Label>
                </div>
                <div className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border cursor-pointer flex-1",
                  dataSource === "IQVIA GPI" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
                )}>
                  <RadioGroupItem value="IQVIA GPI" id="gpi" />
                  <Label htmlFor="gpi" className="cursor-pointer font-medium">IQVIA GPI</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handlePreview} disabled={files.length === 0 || isLoading}>
                {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parsing...</> : `Preview ${files.length} File${files.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Files to Upload ({files.length})</h4>
              <div className="max-h-[250px] overflow-y-auto space-y-2">
                {files.map((fileMeta, idx) => (
                  <div key={idx} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{fileMeta.file.name}</span>
                      <Badge variant="outline">{fileMeta.status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{fileMeta.indication}</span>
                      <span>•</span>
                      <span>{fileMeta.trialPhase}</span>
                      <span>•</span>
                      <span>{fileMeta.parsedCountries.length} countries</span>
                      <span>•</span>
                      <span>{fileMeta.parsedCountries.reduce((sum, c) => sum + c.procedures.length, 0)} procedures</span>
                      {fileMeta.parsedCountries.some(c => c.procedures.some(p => p.p90 !== null)) && (
                        <Badge variant="secondary" className="text-xs h-4">With Pricing</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-accent/30 rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Data Source</span>
                <span className="font-medium">{dataSource}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Upload Mode</span>
                <span className="font-medium">Replace existing</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Procedures</span>
                <span className="font-medium">{files.reduce((sum, f) => sum + f.parsedCountries.reduce((s, c) => s + c.procedures.length, 0), 0)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={handleUploadAll}>Upload All Files</Button>
            </div>
          </div>
        )}

        {step === "uploading" && (
          <div className="space-y-6 py-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <div className="text-center">
                <p className="font-medium">Uploading benchmark data...</p>
                <p className="text-sm text-muted-foreground mt-1">This may take a moment</p>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {step === "complete" && (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-lg">Upload Complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {files.filter(f => f.status === "done").length} of {files.length} files uploaded successfully
                </p>
              </div>
            </div>
            
            {totalStats && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between p-3 bg-accent/50 rounded-lg">
                  <span className="text-muted-foreground">Countries</span>
                  <span className="font-medium">{totalStats.countriesProcessed}</span>
                </div>
                <div className="flex justify-between p-3 bg-accent/50 rounded-lg">
                  <span className="text-muted-foreground">Files Created</span>
                  <span className="font-medium">{totalStats.benchmarkFilesCreated}</span>
                </div>
                <div className="flex justify-between p-3 bg-accent/50 rounded-lg">
                  <span className="text-muted-foreground">Procedures</span>
                  <span className="font-medium">{totalStats.proceduresInserted}</span>
                </div>
              </div>
            )}

            {totalStats?.errors && totalStats.errors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800">Errors:</p>
                <ul className="text-xs text-red-700 mt-1 space-y-1">
                  {totalStats.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
