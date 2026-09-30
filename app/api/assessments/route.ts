import { NextResponse } from "next/server"
import { db, query } from "@/lib/db"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get("status")
    
    
    const { rows: assessments } = await query(
      `SELECT a.*,
              (SELECT count(*)::int FROM assessment_line_items li WHERE li.assessment_id = a.id) AS line_items_count
         FROM assessments a
        WHERE ($1::text IS NULL OR a.status::text = $1)
        ORDER BY a.created_at DESC`,
      [statusFilter],
    )
    
    // Also fetch flagged counts (comparisons with RED or YELLOW flag)
    const assessmentIds = assessments?.map(a => a.id) || []
    let flaggedCounts: Record<string, number> = {}
    
    if (assessmentIds.length > 0) {
      const { data: flaggedData } = await db
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
      line_items_count: a.line_items_count || 0,
      flagged_count: flaggedCounts[a.id] || 0
    })) || []
    
    return NextResponse.json({ assessments: mappedAssessments })
  } catch (err: any) {
    console.error("[v0] Exception fetching assessments:", err)
    return NextResponse.json({ assessments: [], error: err.message }, { status: 200 })
  }
}
