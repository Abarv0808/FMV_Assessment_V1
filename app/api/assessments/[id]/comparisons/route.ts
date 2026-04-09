import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Fetch comparisons with line items using server-side client (bypasses RLS)
    const { data: comparisonsData, error: comparisonsError } = await supabase
      .from("assessment_comparisons")
      .select(`
        *,
        assessment_line_items!inner (
          id,
          procedure_name,
          country,
          vendor_cost,
          currency,
          extra_data
        )
      `)
      .eq("assessment_id", id)
      .order("created_at", { ascending: true })
    
    console.log("[v0] Comparisons API fetch result:", comparisonsData?.length, "items, error:", comparisonsError?.message)
    
    if (comparisonsError) {
      return NextResponse.json({ error: comparisonsError.message }, { status: 500 })
    }
    
    return NextResponse.json({ comparisons: comparisonsData || [] })
    
  } catch (error: any) {
    console.error("[v0] Comparisons API error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
