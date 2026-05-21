import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    console.log("[v0] PATCH line-item raw body:", JSON.stringify(body))
    const { additionalInformation, costCategory, negotiatedPrice, decision } = body

    const supabase = createAdminClient()

    // If updating negotiatedPrice, do it directly on the column
    if (negotiatedPrice !== undefined) {
      const { error: priceError } = await supabase
        .from("assessment_line_items")
        .update({ negotiated_price: negotiatedPrice })
        .eq("id", id)

      if (priceError) {
        console.error("[v0] Error updating negotiated price:", priceError)
        return NextResponse.json({ error: priceError.message }, { status: 500 })
      }

      console.log("[v0] Updated negotiated price for line item:", id, "to:", negotiatedPrice)
      return NextResponse.json({ success: true })
    }

    // Get current line item to update procedure_name field
    const { data: lineItem, error: fetchError } = await supabase
      .from("assessment_line_items")
      .select("procedure_name")
      .eq("id", id)
      .single()

    if (fetchError) {
      console.error("[v0] Error fetching line item:", fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Parse existing procedure_name (format: "description|||{json}")
    const procedureName = lineItem.procedure_name || ""
    const [currentDescription, extraDataStr] = procedureName.split("|||")
    
    let extraData: Record<string, any> = {}
    try {
      if (extraDataStr) {
        extraData = JSON.parse(extraDataStr)
      }
    } catch (e) {
      // Ignore parse errors
    }

    // Update fields
    const newDescription = additionalInformation !== undefined ? additionalInformation : currentDescription
    if (costCategory !== undefined) {
      extraData.costCategory = costCategory
    }
    if (decision !== undefined) {
      extraData.decision = decision
    }

    // Rebuild procedure_name with updated data
    const newProcedureName = `${newDescription}|||${JSON.stringify(extraData)}`

    // Update line item
    const { error: updateError } = await supabase
      .from("assessment_line_items")
      .update({ procedure_name: newProcedureName })
      .eq("id", id)

    if (updateError) {
      console.error("[v0] Error updating line item:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log("[v0] Updated line item:", id, "additionalInfo:", additionalInformation?.substring(0, 30), "costCategory:", costCategory, "decision:", decision)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Line item update error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
