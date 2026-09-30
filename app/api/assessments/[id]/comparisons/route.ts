import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const { rows: comparisonsData } = await query(
      `SELECT c.*,
              json_build_object(
                'id', li.id,
                'procedure_name', li.procedure_name,
                'country', li.country,
                'vendor_cost', li.vendor_cost,
                'currency', li.currency,
                'negotiated_price', li.negotiated_price
              ) AS assessment_line_items
         FROM assessment_comparisons c
         JOIN assessment_line_items li ON li.id = c.line_item_id
        WHERE c.assessment_id = $1
        ORDER BY c.created_at ASC`,
      [id],
    )

    return NextResponse.json(
      { comparisons: comparisonsData || [] },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
    
  } catch (error: any) {
    console.error("[v0] Comparisons API error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
