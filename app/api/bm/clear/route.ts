import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function DELETE() {
  try {
    const supabase = await createClient()
    
    // First, delete all benchmark procedures
    const { error: procError } = await supabase
      .from("benchmark_procedures")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000") // Delete all (neq with impossible value)
    
    if (procError) {
      console.error("[v0] Error deleting benchmark procedures:", procError.message)
    }
    
    // Then delete all benchmark files
    const { error: fileError } = await supabase
      .from("benchmark_files")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000") // Delete all
    
    if (fileError) {
      console.error("[v0] Error deleting benchmark files:", fileError.message)
    }
    
    return NextResponse.json({
      success: true,
      message: "All benchmark data has been cleared. You can now re-upload your benchmark files."
    })
  } catch (error: any) {
    console.error("[v0] Error clearing benchmark data:", error.message)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
