import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  console.log("[v0] Store Items API called")
  
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { assessmentId, lineItems } = body
    
    console.log("[v0] Storing", lineItems?.length, "line items for assessment", assessmentId)
    
    if (!assessmentId || !lineItems || lineItems.length === 0) {
      return NextResponse.json({ error: "Missing assessmentId or lineItems" }, { status: 400 })
    }
    
    // Insert line items one by one to avoid any schema issues
    const insertedIds: string[] = []
    
    for (const item of lineItems) {
      // Store description in procedure_name, site in country
      // Encode numberOfUnit and unitPrice in vendor_cost as JSON string workaround
      // Format: "numberOfUnits|unitPrice|totalCost" in a parseable way
      const extraData = JSON.stringify({
        numberOfUnit: item.numberOfUnit || 1,
        unitPrice: item.unitPrice || 0,
        unitType: item.unitType || null,
        costCategory: item.costCategory || null
      })
      
      const { data, error } = await supabase
        .from("assessment_line_items")
        .insert({
          assessment_id: assessmentId,
          procedure_name: `${item.additionalInformation || item.description || "Unknown"}|||${extraData}`,
          country: item.site || "Unknown",
          vendor_cost: item.totalCost || 0,
          currency: item.currency || "USD"
        })
        .select("id")
        .single()
      
      if (error) {
        console.error("[v0] Error inserting line item:", error)
      } else if (data) {
        insertedIds.push(data.id)
        
        // Create comparison record
        const { error: compError } = await supabase
          .from("assessment_comparisons")
          .insert({
            assessment_id: assessmentId,
            line_item_id: data.id,
            flag: "NO_MATCH"
          })
        
        if (compError) {
          console.error("[v0] Error inserting comparison:", compError.message)
        } else {
          console.log("[v0] Created comparison for line item:", data.id)
        }
      }
    }
    
    console.log("[v0] Inserted", insertedIds.length, "line items")
    
    // Update assessment status
    await supabase
      .from("assessments")
      .update({ status: "completed" })
      .eq("id", assessmentId)
    
    return NextResponse.json({ 
      success: true, 
      insertedCount: insertedIds.length,
      ids: insertedIds
    })
    
  } catch (error: any) {
    console.error("[v0] Store items error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
