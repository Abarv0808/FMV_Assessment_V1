import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  // Get a sample of benchmark procedures to see what data we have
  const { data: procedures, error } = await supabase
    .from("benchmark_procedures")
    .select("*")
    .limit(20)
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  // Get file info
  const { data: files } = await supabase
    .from("benchmark_files")
    .select("*")
    .limit(5)
  
  // Analyze the data
  const analysis = {
    totalProcedures: procedures?.length || 0,
    withP25: procedures?.filter(p => p.p25 != null).length || 0,
    withP50: procedures?.filter(p => p.p50 != null).length || 0,
    withP75: procedures?.filter(p => p.p75 != null).length || 0,
    withP90: procedures?.filter(p => p.p90 != null).length || 0,
    sampleProcedures: procedures?.slice(0, 10).map(p => ({
      name: p.procedure_name,
      code: p.procedure_code,
      category: p.category,
      p25: p.p25,
      p50: p.p50,
      p75: p.p75,
      p90: p.p90
    })),
    files: files?.map(f => ({
      id: f.id,
      fileName: f.file_name,
      indication: f.indication,
      country: f.country,
      procedureCount: f.procedure_count
    }))
  }
  
  return NextResponse.json(analysis)
}
