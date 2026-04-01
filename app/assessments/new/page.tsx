"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { parseVendorProposal } from "@/lib/excel-parser"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"
import { AssessmentInfoStep } from "@/components/wizard/assessment-info-step"
import { ProposalUploadStep } from "@/components/wizard/proposal-upload-step"
import { ReviewStep } from "@/components/wizard/review-step"
import { createClient } from "@/lib/supabase/client"

type WizardStep = "info" | "upload" | "review"

import type { TherapeuticArea, SecurityGroup } from "@/lib/types"

interface AssessmentFormData {
  name: string
  studyTrackingNumber: string
  protocolNumber: string
  therapeuticArea: TherapeuticArea | ""
  businessUnit: SecurityGroup | ""
  description: string
  targetDate: Date | undefined
  vendorProposal: File | null
  benchmarkFile: File | null
  benchmarkSource: "grantplan" | "grantsmanager" | null
  selectedBenchmarkFileId: string | null
  selectedBenchmarkFileIds: string[]
}

const steps: { id: WizardStep; title: string; description: string }[] = [
  { id: "info", title: "Assessment Details", description: "Basic information" },
  { id: "upload", title: "Upload Proposals", description: "Add proposal files" },
  { id: "review", title: "Review & Submit", description: "Confirm details" },
]

export default function NewAssessmentPage() {
  const router = useRouter()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [formData, setFormData] = useState<AssessmentFormData>({
    name: "",
    studyTrackingNumber: "",
    protocolNumber: "",
    therapeuticArea: "",
    businessUnit: "",
    description: "",
    targetDate: undefined,
    vendorProposal: null,
    benchmarkFile: null,
    benchmarkSource: null,
    selectedBenchmarkFileId: null,
    selectedBenchmarkFileIds: [],
  })

  const currentStep = steps[currentStepIndex]
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  const updateFormData = (data: Partial<AssessmentFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }))
  }

  const handleNext = () => {
    if (!canProceed()) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }

  const handleSubmit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const supabase = createClient()

      // 1. Create assessment in database
      const { data: assessment, error: assessmentError } = await supabase
        .from("assessments")
        .insert({
          name: formData.name,
          study_tracking_number: formData.studyTrackingNumber || null,
          protocol_number: formData.protocolNumber || null,
          therapeutic_area: formData.therapeuticArea,
          business_unit: formData.businessUnit,
          description: formData.description || null,
          target_date: formData.targetDate?.toISOString() || null,
          benchmark_source: formData.benchmarkSource === "grantplan" ? "IQVIA_GRANTPLAN" : "IQVIA_GPI_GRANTSMANAGER",
          vendor_file_name: formData.vendorProposal?.name || null,
          status: "processing"
        })
        .select("id")
        .single()

      if (assessmentError || !assessment) {
        throw new Error(assessmentError?.message || "Failed to create assessment")
      }

      // 2. Link benchmark files to assessment
      const benchmarkIds = formData.selectedBenchmarkFileIds.length > 0 
        ? formData.selectedBenchmarkFileIds 
        : formData.selectedBenchmarkFileId 
          ? [formData.selectedBenchmarkFileId] 
          : []

      if (benchmarkIds.length > 0) {
        const benchmarkLinks = benchmarkIds.map(fileId => ({
          assessment_id: assessment.id,
          benchmark_file_id: fileId
        }))

        const { error: linkError } = await supabase
          .from("assessment_benchmark_files")
          .insert(benchmarkLinks)

        if (linkError) {
          console.error("[v0] Error linking benchmark files:", linkError)
        }
      }

      // 3. Parse vendor Excel file from "Sponsor" tab
      // Excel column mapping:
      // - Site (optional) -> site
      // - Description of costs -> description (Additional Information)
      // - Number of Units -> numberOfUnits
      // - Unit Price -> unitPrice
      // - Total Cost -> totalCost
      // - Currency -> currency
      let parsedProposal = { lineItems: [] as any[], metadata: { sheetName: "", rowCount: 0, parsedAt: "" } }
      if (formData.vendorProposal) {
        const arrayBuffer = await formData.vendorProposal.arrayBuffer()
        parsedProposal = parseVendorProposal(arrayBuffer, assessment.id)
        console.log("[v0] Parsed vendor proposal from sheet:", parsedProposal.metadata.sheetName)
        console.log("[v0] Found", parsedProposal.lineItems.length, "line items")
        if (parsedProposal.lineItems.length > 0) {
          console.log("[v0] Sample line item:", parsedProposal.lineItems[0])
        }
      }

      // 4. Store line items DIRECTLY via Supabase client
      const lineItems = parsedProposal.lineItems
      console.log("[v0] Inserting", lineItems.length, "line items directly via Supabase client")
      
      if (lineItems.length > 0) {
        // Insert line items using the parsed AssessmentLineItem structure
        const lineItemsToInsert = lineItems.map((item, index) => ({
          assessment_id: assessment.id,
          procedure_name: item.description || "Unknown",
          site: item.site || null,
          additional_information: item.description,
          category: item.costCategory || null,
          unit: item.unitType || null,
          number_of_unit: item.numberOfUnits,
          unit_price: item.unitPrice,
          total_cost: item.totalCost,
          currency: item.currency || "USD",
          row_index: index
        }))

        console.log("[v0] Line items to insert:", lineItemsToInsert.slice(0, 2))

        const { data: insertedItems, error: insertError } = await supabase
          .from("assessment_line_items")
          .insert(lineItemsToInsert)
          .select("id")

        if (insertError) {
          console.error("[v0] Error inserting line items:", insertError)
        } else {
          console.log("[v0] Successfully inserted", insertedItems?.length, "line items")
          
          // Create comparison records
          if (insertedItems && insertedItems.length > 0) {
            const comparisons = insertedItems.map((item: any) => ({
              assessment_id: assessment.id,
              line_item_id: item.id,
              flag: "NO_MATCH",
              ai_description: "Pending benchmark comparison"
            }))

            const { error: compError } = await supabase
              .from("assessment_comparisons")
              .insert(comparisons)

            if (compError) {
              console.error("[v0] Error inserting comparisons:", compError)
            } else {
              console.log("[v0] Successfully inserted", comparisons.length, "comparisons")
            }
          }
        }

        // Update assessment status
        await supabase
          .from("assessments")
          .update({ status: "completed" })
          .eq("id", assessment.id)
      }

      // 5. Navigate to assessment detail page
      router.push(`/assessments/${assessment.id}`)

    } catch (error) {
      console.error("[v0] Submit error:", error)
      setSubmitError(error instanceof Error ? error.message : "Failed to create assessment")
      setIsSubmitting(false)
    }
  }

  const canProceed = () => {
    if (currentStep.id === "info") {
      return formData.name.trim().length > 0 && formData.therapeuticArea !== "" && formData.businessUnit !== ""
    }
    if (currentStep.id === "upload") {
      const hasBenchmark = formData.selectedBenchmarkFileId || formData.benchmarkFile || formData.selectedBenchmarkFileIds.length > 0
      return formData.vendorProposal && hasBenchmark && formData.benchmarkSource
    }
    return true
  }

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">New Assessment</h1>
            <p className="text-muted-foreground mt-1">Create a new FMV assessment</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
            <span className="font-medium">{currentStep.title}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isActive = index === currentStepIndex
            const isCompleted = index < currentStepIndex
            return (
              <div key={step.id} className="flex items-center gap-3 flex-1">
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      isCompleted
                        ? "bg-primary border-primary text-primary-foreground"
                        : isActive
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? <Check className="h-5 w-5" /> : <span>{index + 1}</span>}
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`h-[2px] w-full -mt-12 ${isCompleted ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            )
          })}
        </div>

        <Card className="border-border/40">
          <CardHeader>
            <CardTitle>{currentStep.title}</CardTitle>
            <CardDescription>{currentStep.description}</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[400px]">
            {currentStep.id === "info" && <AssessmentInfoStep data={formData} onChange={updateFormData} showErrors={showErrors} />}
            {currentStep.id === "upload" && <ProposalUploadStep data={formData} onChange={updateFormData} />}
            {currentStep.id === "review" && <ReviewStep data={formData} />}
          </CardContent>
        </Card>

        {submitError && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4 text-sm">
            {submitError}
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack} disabled={currentStepIndex === 0}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          {currentStepIndex < steps.length - 1 ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canProceed() || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Create Assessment
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  )
}
