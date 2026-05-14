import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = createAdminClient()
    
    // Fetch assessments with line item count
    // First try a simple query to see raw count
    const { count, error: countError } = await supabase
      .from("assessments")
      .select("*", { count: "exact", head: true })
    
    console.log("[v0] Raw assessments count:", count, "Error:", countError?.message || "none")
    
    const { data: assessments, error } = await supabase
      .from("assessments")
      .select(`
        *,
        assessment_line_items(count)
      `)
      .order("created_at", { ascending: false })
    
    console.log("[v0] Assessments query result - data length:", assessments?.length, "error:", error?.message || "none")
    
    if (error) {
      console.log("[v0] Error fetching assessments:", error.message, error.code, error.details)
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
    
    console.log("[v0] Fetched", mappedAssessments.length, "assessments with counts")
    
    return NextResponse.json({ assessments: mappedAssessments })
  } catch (err: any) {
    console.error("[v0] Exception fetching assessments:", err)
    return NextResponse.json({ assessments: [], error: err.message }, { status: 200 })
  }
}
