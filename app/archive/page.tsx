"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Archive } from "lucide-react"
import { mockAssessments } from "@/lib/mock-data"
import { filterAssessmentsByUser } from "@/lib/assessment-utils"
import { formatDistanceToNow } from "date-fns"

export default function ArchivePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")

  // Apply BU-based visibility, then filter to only ARCHIVED
  const archivedAssessments = useMemo(() => {
    const visible = filterAssessmentsByUser(mockAssessments, user)
    return visible.filter((a) => a.status === "ARCHIVED")
  }, [user])

  const filteredAssessments = archivedAssessments.filter((assessment) => {
    const matchesSearch =
      assessment.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assessment.studyTrackingNumber.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  return (
    <AppShell>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Archive className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Archive</h1>
            <p className="text-muted-foreground mt-1">
              Assessments marked as no longer required
            </p>
          </div>
        </div>

        {/* Search */}
        <Card className="border-border/40">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search archived assessments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        {filteredAssessments.length > 0 ? (
          <Card className="border-border/40">
            <CardContent className="p-0">
              <div className="border border-border/40 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/40">
                      <TableHead>Assessment Name</TableHead>
                      <TableHead>Study Tracking #</TableHead>
                      <TableHead>Business Unit</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Archived</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssessments.map((assessment) => (
                      <TableRow
                        key={assessment.id}
                        className="border-border/40 cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/assessments/${assessment.id}`)}
                      >
                        <TableCell className="font-medium">{assessment.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {assessment.studyTrackingNumber}
                        </TableCell>
                        <TableCell>{assessment.businessUnit ?? "N/A"}</TableCell>
                        <TableCell>{assessment.proposalCount}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-muted text-muted-foreground border-border/40">
                            No Longer Required
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatDistanceToNow(new Date(assessment.updatedAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/40">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {archivedAssessments.length === 0
                  ? "No archived assessments available for your Security Group selection."
                  : "No archived assessments found matching your search."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
