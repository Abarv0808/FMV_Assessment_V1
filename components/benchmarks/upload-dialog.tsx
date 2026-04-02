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

interface ParsedCountry {
  country: string
  currency: string
  procedures: Array<{
    name: string
    category: string
    unitCost: number
  }>
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

// Client-side Excel parser
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
    
    const procedures: Array<{ name: string; category: string; unitCost: number }> = []
    let currentCategory = "Procedures"
    
    for (const row of rows) {
      if (!row || row.length === 0) continue
      
      const firstCell = String(row[0] || "").trim()
      if (!firstCell) continue
      
      // Detect category headers
      if (firstCell.toLowerCase().includes("procedure") && !firstCell.toLowerCase().includes("sub")) {
        currentCategory = "Procedures"
        continue
      }
      if (firstCell.toLowerCase().includes("non-procedure") || firstCell.toLowerCase().includes("non procedure")) {
        currentCategory = "Non-Procedures"
        continue
      }
      if (firstCell.toLowerCase().includes("site cost")) {
        currentCategory = "Site Costs"
        continue
      }
      
      // Skip header rows and subtotal rows
      if (firstCell.toLowerCase().includes("total") || 
          firstCell.toLowerCase().includes("header") ||
          firstCell.toLowerCase() === "procedure name" ||
          firstCell.toLowerCase() === "name") {
        continue
      }
      
      // Find unit cost in the row (usually in columns 2-10)
      let unitCost = 0
      for (let i = 1; i < Math.min(row.length, 10); i++) {
        const val = row[i]
        if (typeof val === "number" && val > 0) {
          unitCost = val
          break
        }
      }
      
      if (firstCell.length > 0 && firstCell.length < 200) {
        procedures.push({
          name: firstCell,
          category: currentCategory,
          unitCost
        })
      }
    }
    
    if (procedures.length > 0) {
      countries.push({
        country: sheetName,
        currency: "USD", // Will be replaced by server from database mapping
        procedures
      })
    }
  }
  
  return countries
}

export function BenchmarkUploadDialog({ open, onOpenChange, onSuccess }: BenchmarkUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [indication, setIndication] = useState<Indication | "">("")
  const [dataSource, setDataSource] = useState<"IQVIA GrantPlan" | "IQVIA GPI">("IQVIA GrantPlan")
  const [trialPhase, setTrialPhase] = useState<"All Phases" | "Phase 4">("All Phases")
  const [uploadMode] = useState<"replace">("replace")
  const [step, setStep] = useState<"upload" | "preview" | "uploading" | "complete">("upload")
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [parsedCountries, setParsedCountries] = useState<ParsedCountry[]>([])
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ success: boolean; stats?: UploadStats; error?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const resetState = useCallback(() => {
    setFile(null)
    setIndication("")
    setDataSource("IQVIA GrantPlan")
    setTrialPhase("All Phases")
    // uploadMode is always "replace"
    setStep("upload")
    setPreview(null)
    setParsedCountries([])
    setProgress(0)
    setResult(null)
    setIsLoading(false)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onOpenChange(false)
  }, [resetState, onOpenChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith(".xlsx") || droppedFile.name.endsWith(".xls"))) {
      setFile(droppedFile)
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
    }
  }, [])

  const handlePreview = useCallback(async () => {
    if (!file) return
    
    setIsLoading(true)
    try {
      const buffer = await file.arrayBuffer()
      const countries = parseExcelFile(buffer)
      
      if (countries.length === 0) {
        setResult({ success: false, error: "No valid country data found in the file" })
        setStep("complete")
        return
      }
      
      setParsedCountries(countries)
      setPreview({ countries })
      setStep("preview")
    } catch (error) {
      setResult({ success: false, error: "Failed to parse file. Please ensure it's a valid Excel file." })
      setStep("complete")
    } finally {
      setIsLoading(false)
    }
  }, [file])

  const handleUpload = useCallback(async () => {
    if (!indication || parsedCountries.length === 0) return
    
    setStep("uploading")
    setProgress(10)
    
    try {
      setProgress(30)
      
      const response = await fetch("/api/bm/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countries: parsedCountries,
          indication,
          dataSource,
          trialPhase,
          uploadMode,
        })
      })
      
      setProgress(80)
      
      const data = await response.json()
      
      setProgress(100)
      
      if (data.success) {
        setResult({ success: true, stats: data.stats })
        onSuccess?.()
      } else {
        setResult({ success: false, error: data.error || "Upload failed" })
      }
      
      setStep("complete")
    } catch (error) {
      setResult({ success: false, error: "Upload failed. Please try again." })
      setStep("complete")
    }
  }, [parsedCountries, indication, dataSource, trialPhase, uploadMode, onSuccess])

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
            {!file ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => document.getElementById("bm-file-input")?.click()}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-full bg-accent p-3">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Click to upload or drag and drop</p>
                    <p className="text-xs text-muted-foreground mt-1">Excel files (.xlsx, .xls)</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm">Browse Files</Button>
                </div>
                <input
                  id="bm-file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              <Card className="p-4 border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded bg-primary/10 p-2">
                      <FileSpreadsheet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            )}

            <div className="space-y-2">
              <Label>Data Source *</Label>
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

            {dataSource === "IQVIA GrantPlan" && (
              <div className="space-y-2">
                <Label>Trial Phase *</Label>
                <RadioGroup 
                  value={trialPhase} 
                  onValueChange={(val) => setTrialPhase(val as "All Phases" | "Phase 4")}
                  className="flex gap-4"
                >
                  <div className={cn(
                    "flex items-center gap-2 p-3 rounded-lg border cursor-pointer flex-1",
                    trialPhase === "All Phases" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
                  )}>
                    <RadioGroupItem value="All Phases" id="ap" />
                    <Label htmlFor="ap" className="cursor-pointer font-medium">All Phases</Label>
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 p-3 rounded-lg border cursor-pointer flex-1",
                    trialPhase === "Phase 4" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"
                  )}>
                    <RadioGroupItem value="Phase 4" id="p4" />
                    <Label htmlFor="p4" className="cursor-pointer font-medium">Phase 4</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ind-select">Indication *</Label>
              <Select value={indication} onValueChange={(val) => setIndication(val as Indication)}>
                <SelectTrigger id="ind-select" className={cn(!indication && "text-muted-foreground")}>
                  <SelectValue placeholder="Select Indication" />
                </SelectTrigger>
                <SelectContent>
                  {INDICATIONS.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handlePreview} disabled={!file || !indication || isLoading}>
                {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parsing...</> : "Preview Data"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Countries Detected ({preview.countries.length})</h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {preview.countries.map((c) => (
                  <div key={c.country} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.country}</span>
                      <Badge variant="secondary" className="text-xs">{c.procedures.length} procedures</Badge>
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
              {dataSource === "IQVIA GrantPlan" && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Trial Phase</span>
                  <span className="font-medium">{trialPhase}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Indication</span>
                <span className="font-medium">{indication}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Upload Mode</span>
                <span className="font-medium">Replace existing</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={handleUpload}>Upload {preview.countries.length} Countries</Button>
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

        {step === "complete" && result && (
          <div className="space-y-6 py-4">
            {result.success ? (
              <>
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="rounded-full bg-green-100 p-3">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-lg">Upload Complete</p>
                    <p className="text-sm text-muted-foreground mt-1">Benchmark data uploaded successfully</p>
                  </div>
                </div>
                {result.stats && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between p-3 bg-accent/50 rounded-lg">
                      <span className="text-muted-foreground">Countries</span>
                      <span className="font-medium">{result.stats.countriesProcessed}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-accent/50 rounded-lg">
                      <span className="text-muted-foreground">Files Created</span>
                      <span className="font-medium">{result.stats.benchmarkFilesCreated}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-accent/50 rounded-lg">
                      <span className="text-muted-foreground">Procedures</span>
                      <span className="font-medium">{result.stats.proceduresInserted}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="rounded-full bg-red-100 p-3">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
                <div>
                  <p className="font-medium text-lg">Upload Failed</p>
                  <p className="text-sm text-muted-foreground mt-1">{result.error}</p>
                </div>
              </div>
            )}
            <div className="flex justify-end pt-4">
              <Button onClick={handleClose}>{result.success ? "Done" : "Close"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
