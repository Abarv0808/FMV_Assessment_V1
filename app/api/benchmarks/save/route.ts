// v3 - with file_name field
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { normalizeTrialPhase } from "@/lib/types"

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { countries, indication, dataSource, trialPhase, uploadMode } = body
    
    if (!countries || !Array.isArray(countries) || countries.length === 0) {
      return NextResponse.json({ success: false, error: "No countries data provided" }, { status: 400 })
    }
    
    if (!indication) {
      return NextResponse.json({ success: false, error: "Indication is required" }, { status: 400 })
    }
    
    const db = getDb()
    const source = dataSource === "IQVIA GrantPlan" ? "IQVIA_GRANTPLAN" : "IQVIA_GPI_GRANTSMANAGER"
    
    // Normalize to the canonical database value, including Phase IIIb.
    const phase = normalizeTrialPhase(indication, trialPhase)
    
    // Fetch currency mapping from database
    const { data: currencyData } = await db.from("country_currencies").select("country, currency_code")
    const currencyMap: Record<string, string> = {}
    if (currencyData) {
      for (const row of currencyData) {
        currencyMap[row.country] = row.currency_code
      }
    }
    
    // Replace mode: Only delete files for the SAME indication, source, AND phase
    if (uploadMode === "replace") {
      const { data: existing } = await db
        .from("benchmark_files")
        .select("id")
        .eq("indication", indication)
        .eq("source", source)
        .eq("trial_phase", phase)
      
      if (existing?.length) {
        const ids = existing.map((f: { id: string }) => f.id)
        await db.from("benchmark_procedures").delete().in("benchmark_file_id", ids)
        await db.from("benchmark_files").delete().in("id", ids)
      }
    }
    
    let filesCreated = 0
    let proceduresCreated = 0
    
    for (const country of countries) {
      const currency = currencyMap[country.country] || country.currency || "USD"
      
      // Generate file_name - REQUIRED by database
      const fileName = `${indication}_${country.country}_${phase}_${source}`.replace(/\s+/g, "_")
      
      // Create benchmark file with file_name
      const { data: fileData, error: fileError } = await db
        .from("benchmark_files")
        .insert({
          file_name: fileName,
          indication,
          country: country.country,
          currency,
          trial_phase: phase,
          source,
          procedure_count: country.procedures?.length || 0,
        })
        .select("id")
        .single()
      
      if (fileError || !fileData) {
        console.error("Error creating benchmark file:", fileError)
        continue
      }
      
      filesCreated++
      
      // Insert procedures with correct column names
      if (country.procedures && country.procedures.length > 0) {
        const parseValue = (val: any): number | null => {
          if (val === null || val === undefined || val === "") return null
          const num = typeof val === "number" ? val : parseFloat(val)
          return isNaN(num) ? null : num
        }

        const procedureRecords = country.procedures.map((proc: any) => ({
          benchmark_file_id: fileData.id,
          procedure_code: proc.code || proc.procedure_code || "",
          procedure_name: proc.name || proc.procedure_name || "Unknown",
          category: proc.category || "Procedures",
          p25: parseValue(proc.p25),
          p50: parseValue(proc.p50),
          p75: parseValue(proc.p75),
          p90: parseValue(proc.p90),
          p100: parseValue(proc.p100),
          mean: parseValue(proc.mean),
          sample_size: proc.sample_size ? parseInt(proc.sample_size) : null,
          source_ref: proc.sourceRef || proc.source_ref || null,
        }))
        
        const { error: procError } = await db.from("benchmark_procedures").insert(procedureRecords)
        if (!procError) {
          proceduresCreated += procedureRecords.length
        } else {
          console.error("[v0] Error inserting procedures:", procError)
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      stats: {
        countriesProcessed: countries.length,
        benchmarkFilesCreated: filesCreated,
        proceduresInserted: proceduresCreated,
        proceduresDeleted: 0,
        errors: []
      }
    })
  } catch (error) {
    console.error("Save error:", error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to save data" 
    }, { status: 500 })
  }
}
