import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get("status")
    
    const supabase = createAdminClient()
    
    // Fetch assessments with line item count
    let query = supabase
      .from("assessments")
      .select(`
        *,
        assessment_line_items(count)
      `)
    
    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq("status", statusFilter)
    }
    
    const { data: assessments, error } = await query.order("created_at", { ascending: false })
    
    if (error) {
      return NextResponse.json({ assessments: [], error: error.message }, { status: 200 })
    }
    
    // Also fetch flagged counts (comparisons with RED or YELLOW flag)
    const assessmentIds = assessments?.map(a => a.id) || []
    let flaggedCounts: Record<string, number> = {}
    
    if (assessmentIds.length > 0) {
      const { data: flaggedData } = await supabase
        .from("assessment_comparisons")
        .select("assessment_id, flag")
        .in("assessment_id", assessmentIds)
        .in("flag", ["RED", "YELLOW"])
      
      if (flaggedData) {
        for (const item of flaggedData) {
          flaggedCounts[item.assessment_id] = (flaggedCounts[item.assessment_id] || 0) + 1
        }
      }
    }
    
    // Map assessments with counts
    const mappedAssessments = assessments?.map(a => ({
      ...a,
      line_items_count: a.assessment_line_items?.[0]?.count || 0,
      flagged_count: flaggedCounts[a.id] || 0
    })) || []
    
    return NextResponse.json({ assessments: mappedAssessments })
  } catch (err: any) {
    console.error("[v0] Exception fetching assessments:", err)
    return NextResponse.json({ assessments: [], error: err.message }, { status: 200 })
  }
}
