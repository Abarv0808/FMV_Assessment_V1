import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function createDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { indication, dataSource, trialPhase, uploadMode, countries } = body

    if (!indication || !countries || !Array.isArray(countries)) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const db = createDb()
    const source = dataSource === "IQVIA GrantPlan" ? "IQVIA_GRANTPLAN" : "IQVIA_GPI_GRANTSMANAGER"
    
    // Map trial phase to valid enum
    const phaseMap: Record<string, string> = {
      "All Phases": "Phase I",
      "Phase 1": "Phase I",
      "Phase 4": "Phase IV",
      "Phase I": "Phase I",
      "Phase II": "Phase II",
      "Phase III": "Phase III",
      "Phase IV": "Phase IV",
    }
    const phase = phaseMap[trialPhase] || "Phase I"

    // Get currency mapping from database
    const { data: currencyData } = await db.from("country_currencies").select("country, currency_code")
    const currencyMap: Record<string, string> = {}
    if (currencyData) {
      for (const row of currencyData) {
        currencyMap[row.country] = row.currency_code
      }
    }

    // Delete existing if replace mode - only same indication + source + phase
    // IMPORTANT: We now use "append" by default to prevent accidental data loss
    // Only use replace if explicitly set AND indication matches exactly
    if (uploadMode === "replace" && indication && indication.trim().length > 0) {
      console.log("[v0] Replace mode - deleting files for:", { indication, source, phase })
      
      const { data: existing } = await db
        .from("benchmark_files")
        .select("id, indication, trial_phase, source")
        .eq("indication", indication.trim())
        .eq("source", source)
        .eq("trial_phase", phase)

      if (existing?.length) {
        console.log("[v0] Found files to replace:", existing.map(f => `${f.indication} - ${f.trial_phase}`))
        const ids = existing.map((f: { id: string }) => f.id)
        await db.from("benchmark_procedures").delete().in("benchmark_file_id", ids)
        await db.from("benchmark_files").delete().in("id", ids)
        console.log("[v0] Deleted", ids.length, "files for indication:", indication)
      } else {
        console.log("[v0] No existing files found to replace for:", indication)
      }
    } else {
      console.log("[v0] Append mode - not deleting any existing files")
    }

    let filesCreated = 0
    let proceduresCreated = 0

    for (const country of countries) {
      const currency = currencyMap[country.country] || country.currency || "USD"
      
      // Generate a proper file_name - THIS IS THE KEY FIX
      const fileName = `${indication.replace(/\s+/g, "_")}_${country.country.replace(/\s+/g, "_")}_${phase.replace(/\s+/g, "_")}`

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

      if (fileError) {
        console.error("Error creating benchmark file:", fileError)
        continue
      }

      filesCreated++

      // Insert procedures with correct column names for benchmark_procedures table
      // The excel-parser returns: code, name, category, p25, p50, p75, p90, p100, sourceRef
      if (country.procedures?.length && fileData?.id) {
        // Debug: log first 3 raw procedures to see what's being passed
        console.log("[v0] Sample raw procedures from parser (first 3):")
        country.procedures.slice(0, 3).forEach((p: any, i: number) => {
          console.log(`[v0]   ${i + 1}. name="${p.name}" code="${p.code}" p25=${p.p25} p50=${p.p50} p75=${p.p75} p90=${p.p90}`)
        })
        const procedures = country.procedures.map((proc: any) => {
          // Handle both number and string values for percentiles
          const parseValue = (val: any): number | null => {
            if (val === null || val === undefined || val === "") return null
            const num = typeof val === "number" ? val : parseFloat(val)
            return isNaN(num) ? null : num
          }

          return {
            benchmark_file_id: fileData.id,
            procedure_code: proc.code || proc.procedure_code || proc.procedureCode || "",
            procedure_name: proc.name || proc.procedure_name || proc.procedureName || proc.procedure || "Unknown",
            category: proc.category || "Procedures",
            p25: parseValue(proc.p25),
            p50: parseValue(proc.p50),
            p75: parseValue(proc.p75),
            p90: parseValue(proc.p90),
            p100: parseValue(proc.p100),
            mean: parseValue(proc.mean),
            sample_size: proc.sample_size ? parseInt(proc.sample_size) : null,
            source_ref: proc.sourceRef || proc.source_ref || null,
          }
        })

        const { error: procError } = await db.from("benchmark_procedures").insert(procedures)
        if (procError) {
          console.error("[v0] Error inserting procedures:", procError)
        } else {
          proceduresCreated += procedures.length
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${filesCreated} files with ${proceduresCreated} procedures`,
      stats: {
        countriesProcessed: countries.length,
        benchmarkFilesCreated: filesCreated,
        proceduresInserted: proceduresCreated,
        errors: []
      }
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
