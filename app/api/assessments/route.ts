import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: assessments, error } = await supabase
      .from("assessments")
      .select("*")
      .order("created_at", { ascending: false })
    
    if (error) {
      console.log("[v0] Error fetching assessments:", error.message)
      return NextResponse.json({ assessments: [], error: error.message }, { status: 200 })
    }
    
    console.log("[v0] Fetched", assessments?.length || 0, "assessments from database")
    
    return NextResponse.json({ assessments: assessments || [] })
  } catch (err: any) {
    console.error("[v0] Exception fetching assessments:", err)
    return NextResponse.json({ assessments: [], error: err.message }, { status: 200 })
  }
}
