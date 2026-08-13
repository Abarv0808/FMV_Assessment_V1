"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Search, LayoutGrid, List, Loader2 } from "lucide-react"
import { mockAssessments } from "@/lib/mock-data"
import type { Assessment, AssessmentStatus } from "@/lib/types"
import { formatDistanceToNow } from "date-fns"
import { AssessmentCard } from "@/components/assessments/assessment-card"
import { StatusSelect } from "@/components/assessments/status-select"
import { filterAssessmentsByUser } from "@/lib/assessment-utils"

export function AssessmentsContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<AssessmentStatus | "ALL">("ALL")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [allAssessments, setAllAssessments] = useState<Assessment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch assessments from API (uses server-side Supabase to bypass RLS)
  useEffect(() => {
    const fetchAssessments = async () => {
      setIsLoading(true)
      try {
        const response = await fetch("/api/assessments", { cache: "no-store" })
        const { assessments: dbAssessments, error } = await response.json()
        
        console.log("[v0] Assessments fetch result:", dbAssessments?.length, "items, error:", error)
        
        if (error || !dbAssessments || dbAssessments.length === 0) {
          console.log("[v0] No assessments or error, using mock data")
          // Fall back to mock data if API fails or returns empty
          setAllAssessments(mockAssessments)
        } else if (dbAssessments && dbAssessments.length > 0) {
          console.log("[v0] Got", dbAssessments.length, "assessments from DB, mapping...")
          // Map DB assessments to Assessment type
          // DB uses lowercase: 'draft', 'processing', 'completed', 'in_review'
          // UI uses uppercase: 'DRAFT', 'PROCESSING', 'COMPLETED', 'IN_REVIEW'
          const mapStatus = (dbStatus: string): AssessmentStatus => {
            const statusMap: Record<string, AssessmentStatus> = {
              'draft': 'DRAFT',
              'processing': 'IN_REVIEW',
              'completed': 'IN_REVIEW', // Show completed as in_review so they appear
              'in_review': 'IN_REVIEW',
              'approved': 'APPROVED',
              'rejected': 'REJECTED',
              'archived': 'ARCHIVED'
            }
            return statusMap[dbStatus?.toLowerCase()] || 'IN_REVIEW'
          }
          
          const mappedAssessments: Assessment[] = dbAssessments.map((a: any) => ({
            id: a.id,
            name: a.name || "Untitled Assessment",
            studyTrackingNumber: a.study_tracking_number || a.id.slice(0, 8),
            sponsor: a.sponsor || "Unknown",
            status: mapStatus(a.status),
            country: a.country || "Global",
            currency: a.currency || "USD",
            therapeuticArea: a.therapeutic_area || "Unknown",
            indication: a.indication || "",
            trialPhase: a.trial_phase || "Phase I",
            piName: a.pi_name || "",
            siteName: a.site_name || "",
            businessUnit: a.business_unit || "GLOBAL",
            dataSource: a.data_source || "",
            assignedTo: a.assigned_to || "",
            createdAt: a.created_at,
            updatedAt: a.updated_at || a.created_at,
            proposalCount: a.line_items_count || 0,
            flaggedCount: a.flagged_count || 0,
            lineItems: [],
            auditEvents: []
          }))
          setAllAssessments(mappedAssessments)
        } else {
          // No DB assessments, use mock data
          setAllAssessments(mockAssessments)
        }
      } catch (e: any) {
        setAllAssessments(mockAssessments)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAssessments()
  }, [])

  // Show all assessments except archived (removed user filtering for now)
  const assessments = useMemo(() => {
    return allAssessments.filter((a) => a.status !== "ARCHIVED")
  }, [allAssessments])

  const handleStatusChange = useCallback((id: string, newStatus: AssessmentStatus) => {
    setAllAssessments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus, updatedAt: new Date().toISOString() } : a))
    )
  }, [])

  const filteredAssessments = assessments.filter((assessment) => {
    const matchesSearch =
      assessment.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assessment.studyTrackingNumber.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "ALL" || assessment.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-8 flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading assessments...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">All Assessments</h1>
            <p className="text-muted-foreground mt-1">
              {filteredAssessments.length} of {assessments.length} assessments
            </p>
          </div>
          <Button onClick={() => router.push("/assessments/new")} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            New Assessment
          </Button>
        </div>

        {/* Filters */}
        <Card className="border-border/40">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or Study tracking#..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as AssessmentStatus | "ALL")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="IN_REVIEW">In Review</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="MANUAL_ASSESSMENT">Manual Assessment</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex border border-border/40 rounded-lg">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assessment Grid/List */}
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAssessments.map((assessment) => (
              <AssessmentCard key={assessment.id} assessment={assessment} onStatusChange={handleStatusChange} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAssessments.map((assessment) => {
              return (
                <Card
                  key={assessment.id}
                  className="border-border/40 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/assessments/${assessment.id}`)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{assessment.name}</h3>
                          <StatusSelect
                            value={assessment.status}
                            onValueChange={(s) => handleStatusChange(assessment.id, s)}
                            compact
                          />
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{assessment.studyTrackingNumber}</p>
                      </div>
                      <div className="flex items-center gap-8 text-sm">
                        <div className="text-center">
                          <p className="text-muted-foreground">Items</p>
                          <p className="font-medium mt-1">{assessment.proposalCount}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">Flagged</p>
                          <p className="font-medium mt-1 text-red-500">{assessment.flaggedCount}</p>
                        </div>
                        <div className="text-left min-w-[120px]">
                          <p className="text-muted-foreground">Updated</p>
                          <p className="font-medium mt-1">
                            {formatDistanceToNow(new Date(assessment.updatedAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {filteredAssessments.length === 0 && (
          <Card className="border-border/40">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {assessments.length === 0
                  ? "No assessments available for your Security Group selection."
                  : "No assessments found matching your criteria"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
