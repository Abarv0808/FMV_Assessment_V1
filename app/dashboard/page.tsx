"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Search, AlertCircle, FileText, TrendingUp } from "lucide-react"
import { mockAssessments } from "@/lib/mock-data"
import type { Assessment, AssessmentStatus } from "@/lib/types"
import { filterAssessmentsByUser } from "@/lib/assessment-utils"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { StatusSelect } from "@/components/assessments/status-select"

export default function DashboardPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [allAssessments, setAllAssessments] = useState<Assessment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Fetch assessments from API on mount
  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        const response = await fetch("/api/assessments")
        const { assessments: dbAssessments, error } = await response.json()
        
        if (error || !dbAssessments || dbAssessments.length === 0) {
          setAllAssessments(mockAssessments)
        } else {
          // Map DB assessments to Assessment type with proper status
          const mapStatus = (dbStatus: string): AssessmentStatus => {
            const statusMap: Record<string, AssessmentStatus> = {
              'draft': 'DRAFT',
              'processing': 'IN_REVIEW',
              'completed': 'IN_REVIEW',
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
            proposalCount: a.proposal_count || 0,
            flaggedCount: a.flagged_count || 0,
            assignedTo: a.assigned_to || null,
            createdAt: a.created_at,
            updatedAt: a.updated_at || a.created_at,
            businessUnit: a.business_unit || "Pharma",
            dataSource: a.data_source || "IQVIA GrantPlan",
          }))
          setAllAssessments(mappedAssessments)
        }
      } catch (err) {
        setAllAssessments(mockAssessments)
      } finally {
        setIsLoading(false)
      }
    }
    fetchAssessments()
  }, [])

  // Apply BU-based visibility and exclude archived
  const assessments = useMemo(
    () => filterAssessmentsByUser(allAssessments, user).filter((a) => a.status !== "ARCHIVED"),
    [allAssessments, user]
  )

  const handleStatusChange = useCallback((id: string, newStatus: AssessmentStatus) => {
    setAllAssessments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus, updatedAt: new Date().toISOString() } : a))
    )
  }, [])

  // Dashboard shows In Review and Manual Assessment assessments
  const inReviewAssessments = assessments.filter(
    (a) => a.status === "IN_REVIEW" || a.status === "MANUAL_ASSESSMENT"
  )

  const filteredAssessments = inReviewAssessments.filter((assessment) => {
    const matchesSearch =
      assessment.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assessment.studyTrackingNumber.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const stats = {
    total: assessments.length,
    inReview: inReviewAssessments.length,
    flagged: inReviewAssessments.reduce((sum, a) => sum + a.flaggedCount, 0),
  }

  return (
    <AppShell>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, {user?.name}
            </p>
          </div>
          <Button onClick={() => router.push("/assessments/new")} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            New Assessment
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Assessments
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All assessments
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Review
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.inReview}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting approval
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Flagged Items
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stats.flagged}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Require attention
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Assessments Requiring Attention */}
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle>Assessments Requiring Attention</CardTitle>
            <CardDescription>
              Clinical trial FMV assessments in review or requiring manual assessment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by trial name or Study tracking#..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 max-w-md"
              />
            </div>

            {/* Table */}
            <div className="border border-border/40 rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead>Assessment</TableHead>
                    <TableHead>{"Study tracking#"}</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Flagged</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground py-8"
                      >
                        Loading assessments...
                      </TableCell>
                    </TableRow>
                  ) : filteredAssessments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground py-8"
                      >
                        {assessments.length === 0
                          ? "No assessments available for your Security Group selection."
                          : "No assessments in review"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssessments.map((assessment) => {
                      return (
                        <TableRow
                          key={assessment.id}
                          className="cursor-pointer border-border/40"
                          onClick={() =>
                            router.push(`/assessments/${assessment.id}`)
                          }
                        >
                          <TableCell className="font-medium">
                            {assessment.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {assessment.studyTrackingNumber}
                          </TableCell>
                          <TableCell>
                            <StatusSelect
                              value={assessment.status}
                              onValueChange={(s) => handleStatusChange(assessment.id, s)}
                              compact
                            />
                          </TableCell>
                          <TableCell>{assessment.proposalCount}</TableCell>
                          <TableCell>
                            {assessment.flaggedCount > 0 ? (
                              <span className="flex items-center gap-1 text-red-500">
                                <AlertCircle className="h-3 w-3" />
                                {assessment.flaggedCount}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {assessment.assignedTo || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(assessment.updatedAt), {
                              addSuffix: true,
                            })}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
