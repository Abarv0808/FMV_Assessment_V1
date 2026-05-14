import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// Fresh API v1 - no benchmark_procedures query at all
export async function POST(request: Request) {
  console.log("[v0] FRESH Compare API - no benchmark query")
  
  try {
    const body = await request.json()
    const { assessmentId, vendorLineItems } = body
    
    console.log("[v0] Received:", { assessmentId, itemCount: vendorLineItems?.length })
    
    if (!assessmentId || !vendorLineItems || vendorLineItems.length === 0) {
      return NextResponse.json({ error: "Missing required data" }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    
    // Insert line items one by one
    let insertedCount = 0
    for (let i = 0; i < vendorLineItems.length; i++) {
      const item = vendorLineItems[i]
      
      const { data: lineItem, error: lineError } = await supabase
        .from("assessment_line_items")
        .insert({
          assessment_id: assessmentId,
          procedure_name: item.additionalInformation || item.description || "Unknown",
          site: item.site || null,
          additional_information: item.additionalInformation || item.description || null,
          category: item.costCategory || null,
          unit: item.unitType || null,
          number_of_unit: item.numberOfUnit || null,
          unit_price: item.unitPrice || null,
          total_cost: item.totalCost || null,
          currency: item.currency || "USD",
          row_index: i
        })
        .select("id")
        .single()
      
      if (lineError) {
        console.log("[v0] Line item insert error:", lineError)
        continue
      }
      
      if (lineItem) {
        insertedCount++
        
        // Create comparison record
        await supabase.from("assessment_comparisons").insert({
          assessment_id: assessmentId,
          line_item_id: lineItem.id,
          flag: "NO_MATCH",
          ai_description: "Pending benchmark comparison"
        })
      }
    }
    
    console.log("[v0] Inserted", insertedCount, "line items")
    
    // Update assessment status
    await supabase
      .from("assessments")
      .update({ status: "completed" })
      .eq("id", assessmentId)
    
    return NextResponse.json({
      success: true,
      assessmentId,
      insertedCount,
      message: `Stored ${insertedCount} line items`
    })
    
  } catch (error: any) {
    console.error("[v0] API error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
