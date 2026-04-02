import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateText, Output } from "ai"
import { z } from "zod"

// Schema for AI matching results
const matchResultSchema = z.object({
  matches: z.array(z.object({
    benchmarkId: z.string(),
    procedureName: z.string(),
    category: z.string(),
    similarity: z.number(),
    reasoning: z.string(),
  })),
  bestMatchId: z.string().nullable(),
})

export async function POST(request: Request) {
  console.log("[v0] Run comparison API called")
  
  try {
    const body = await request.json()
    const { assessmentId, benchmarkFileIds } = body
    
    console.log("[v0] Assessment ID:", assessmentId)

    if (!assessmentId) {
      return NextResponse.json({ error: "Missing assessmentId" }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Fetch assessment line items
    console.log("[v0] Fetching line items...")
    const { data: lineItems, error: lineItemsError } = await supabase
      .from("assessment_line_items")
      .select("id, procedure_name, country, vendor_cost, currency")
      .eq("assessment_id", assessmentId)

    console.log("[v0] Line items found:", lineItems?.length, "Error:", lineItemsError?.message)

    if (lineItemsError || !lineItems || lineItems.length === 0) {
      return NextResponse.json({ error: "No line items found", details: lineItemsError?.message }, { status: 400 })
    }

    // 2. Fetch benchmark procedures from database
    console.log("[v0] Fetching benchmark procedures...")
    
    let benchmarks: any[] = []
    let benchmarksError: any = null
    
    try {
      // First, try simple query without join to see if procedures exist
      const { data: simpleCheck, error: simpleError } = await supabase
        .from("benchmark_procedures")
        .select("id, procedure_name")
        .limit(5)
      
      console.log("[v0] Simple benchmark check:", simpleCheck?.length, "procedures, error:", simpleError?.message)
      
      // First get the count of all procedures
      const { count: totalCount } = await supabase
        .from("benchmark_procedures")
        .select("id", { count: "exact", head: true })
      
      console.log("[v0] Total benchmark procedures in database:", totalCount)
      
      // Strategy: Get UNIQUE procedure names first (same procedure exists in each country)
      // We'll fetch from multiple countries to get diverse procedure names
      // Then after AI matches, we'll fetch pricing for all countries for matched procedures
      
      // Get distinct procedure names by sampling from different benchmark files
      let benchmarkFileFilter = benchmarkFileIds
      if (!benchmarkFileFilter || benchmarkFileFilter.length === 0) {
        // Get all benchmark files to sample from
        const { data: allFiles } = await supabase
          .from("benchmark_files")
          .select("id, country")
          .limit(100)
        
        if (allFiles && allFiles.length > 0) {
          // Take first file from each indication (they all have same procedure names, different pricing)
          const uniqueCountries = new Map<string, string>()
          for (const file of allFiles) {
            if (file.country && !uniqueCountries.has(file.country)) {
              uniqueCountries.set(file.country, file.id)
            }
          }
          // Just take ONE file - all have same procedure names
          benchmarkFileFilter = [allFiles[0].id]
          console.log("[v0] Using benchmark file:", allFiles[0].country, "to get procedure names")
        }
      }
      
      // Fetch benchmark procedures from ONE country (they all have same procedure names)
      let benchmarkQuery = supabase
        .from("benchmark_procedures")
        .select(`
          id,
          procedure_name,
          procedure_code,
          category,
          p25,
          p50,
          p75,
          p90,
          p100,
          benchmark_file_id,
          benchmark_files(country)
        `)
        .limit(2000)

      // Filter to ONE benchmark file to get unique procedure names
      if (benchmarkFileFilter && benchmarkFileFilter.length > 0) {
        benchmarkQuery = benchmarkQuery.in("benchmark_file_id", benchmarkFileFilter)
      }

      const result = await benchmarkQuery
      const rawBenchmarks = result.data || []
      benchmarksError = result.error
      
      // Filter out metadata rows (headers that were incorrectly parsed as procedures)
      // But DO NOT require pricing data - the Excel may not have been parsed correctly
      const metadataLabels = ['study details', 'study code:', 'short name:', 'drug / compound:', 'title:', 
        'phase:', 'created:', 'modified:', 'budget type:', 'patient type:', 'indications (', 'study type',
        'visits:', 'screened:', 'sites:', 'overhead:', 'lab costs:', 'country details', 'single patient duration:',
        'study population type', 'sub total']
      
      benchmarks = rawBenchmarks.filter((bm: any) => {
        const name = (bm.procedure_name || "").toLowerCase().trim()
        // Filter out empty names and metadata labels
        if (!name || name.length < 2) return false
        if (metadataLabels.some(label => name.includes(label))) return false
        return true
      })
      
      // Count how many have actual pricing data
      const withPricing = benchmarks.filter((bm: any) => 
        bm.p25 != null || bm.p50 != null || bm.p75 != null || bm.p90 != null
      )
      
      // Log countries found in benchmarks
      const benchmarkCountries = [...new Set(benchmarks.map((b: any) => b.benchmark_files?.country).filter(Boolean))]
      console.log("[v0] Benchmark query result:", rawBenchmarks.length, "raw,", benchmarks.length, "valid names,", withPricing.length, "with pricing")
      console.log("[v0] Benchmark countries found:", benchmarkCountries.length, "countries:", benchmarkCountries.slice(0, 10).join(", "), benchmarkCountries.length > 10 ? "..." : "")
      if (benchmarksError) {
        console.log("[v0] Benchmark query error:", benchmarksError)
      }
    } catch (e: any) {
      console.log("[v0] Benchmark query exception:", e.message)
      benchmarksError = e
    }

    if (benchmarksError) {
      // Table might not exist - proceed without benchmarks for now
      console.log("[v0] Continuing without benchmark data due to error")
    }
    
    if (!benchmarks || benchmarks.length === 0) {
      // No benchmarks - still create comparisons but mark as NO_MATCH
      console.log("[v0] No benchmark data found, marking all as NO_MATCH")
      
      for (const lineItem of lineItems) {
        // Check if comparison already exists
        const { data: existing } = await supabase
          .from("assessment_comparisons")
          .select("id")
          .eq("line_item_id", lineItem.id)
          .single()
        
        if (!existing) {
          // Create comparison record
          await supabase
            .from("assessment_comparisons")
            .insert({
              assessment_id: assessmentId,
              line_item_id: lineItem.id,
              flag: "NO_MATCH",
              ai_description: "No benchmark data available for comparison"
            })
        } else {
          await supabase
            .from("assessment_comparisons")
            .update({
              flag: "NO_MATCH",
              ai_description: "No benchmark data available for comparison"
            })
            .eq("id", existing.id)
        }
      }
      
      return NextResponse.json({ 
        success: true,
        message: `No benchmark data found. ${lineItems.length} items marked as NO_MATCH. Please upload benchmark files first.`,
        results: lineItems.map(l => ({ lineItemId: l.id, matchCount: 0, flag: "NO_MATCH" }))
      })
    }

    // Log sample data for debugging
    console.log("[v0] === SAMPLE DATA COMPARISON ===")
    console.log("[v0] LINE ITEMS FROM ASSESSMENT (first 3):")
    lineItems.slice(0, 3).forEach((li: any, idx: number) => {
      const [desc] = (li.procedure_name || "").split("|||")
      console.log(`[v0]   ${idx + 1}. "${desc.trim()}"`)
    })
    console.log("[v0] BENCHMARK PROCEDURES (first 10):")
    benchmarks.slice(0, 10).forEach((bm: any, idx: number) => {
      const hasPricing = bm.p25 != null || bm.p50 != null || bm.p75 != null || bm.p90 != null
      console.log(`[v0]   ${idx + 1}. "${bm.procedure_name}" | HasPricing: ${hasPricing} | P90: ${bm.p90}`)
    })
    console.log("[v0] === END SAMPLE DATA ===")

    // Group benchmarks by category for context
    const benchmarksByCategory: Record<string, any[]> = {}
    for (const bm of benchmarks) {
      const cat = bm.category || "Other"
      if (!benchmarksByCategory[cat]) benchmarksByCategory[cat] = []
      benchmarksByCategory[cat].push(bm)
    }

    const results: any[] = []

    // 3. For each line item, use AI to find matching benchmarks
    for (const lineItem of lineItems) {
      // Parse description from procedure_name (format: "description|||{json}")
      const procedureName = lineItem.procedure_name || ""
      const [description] = procedureName.split("|||")
      const cleanDescription = description.trim()

      console.log("[v0] Processing line item:", `"${cleanDescription}"`)
      
      if (!cleanDescription || cleanDescription === "Unknown") {
        // No description - mark as no match
        results.push({
          lineItemId: lineItem.id,
          matches: [],
          bestMatch: null,
          flag: "NO_MATCH"
        })
        continue
      }

      // Build benchmark context for AI
      const benchmarkContext = Object.entries(benchmarksByCategory)
        .map(([category, items]) => {
          const itemList = items.slice(0, 30).map((b: any) => 
            `- ID: ${b.id} | Name: ${b.procedure_name} | Code: ${b.procedure_code || "N/A"}`
          ).join("\n")
          return `Category: ${category}\n${itemList}`
        })
        .join("\n\n")

      // Use AI to find matching benchmarks
      const prompt = `You are a medical procedure matching expert. Match the following line item description to the most similar benchmark procedures.

LINE ITEM DESCRIPTION:
"${cleanDescription}"

AVAILABLE BENCHMARK PROCEDURES:
${benchmarkContext}

Find up to 3 most similar benchmark procedures. Consider:
1. Medical/procedure terminology similarity
2. Service type (procedure vs non-procedure vs site cost)
3. Semantic meaning, not just keyword matching

Return ONLY procedures that are genuinely similar (similarity > 0.5). If no good matches exist, return an empty array.`

      try {
        const { output } = await generateText({
          model: "openai/gpt-4o-mini",
          prompt,
          output: Output.object({
            schema: matchResultSchema,
          }),
        })

        console.log("[v0] AI returned", output?.matches?.length || 0, "matches for:", cleanDescription.substring(0, 40))
        if (output?.matches?.length > 0) {
          output.matches.forEach((m: any, i: number) => {
            console.log(`[v0]   Match ${i + 1}: "${m.procedureName}" (${Math.round(m.similarity * 100)}% similar)`)
          })
        }
        
        if (output && output.matches && output.matches.length > 0) {
          // For each matched procedure, fetch pricing from ALL countries
          const matchedProcedureNames = output.matches.map((m: any) => m.procedureName)
          
          // Query all benchmark procedures with these names (from all countries)
          const { data: allCountryPricing } = await supabase
            .from("benchmark_procedures")
            .select(`
              id,
              procedure_name,
              category,
              p25,
              p50,
              p75,
              p90,
              p100,
              benchmark_files(country)
            `)
            .in("procedure_name", matchedProcedureNames)
            .limit(500)
          
          // Build matches with all countries' pricing
          const matchedBenchmarks: any[] = []
          for (const match of output.matches) {
            // Find all country versions of this procedure
            const allCountryVersions = (allCountryPricing || []).filter(
              (bp: any) => bp.procedure_name === match.procedureName
            )
            
            if (allCountryVersions.length > 0) {
              // Add each country's pricing as a separate match option
              for (const version of allCountryVersions) {
                matchedBenchmarks.push({
                  benchmarkId: version.id,
                  procedureName: version.procedure_name,
                  similarity: match.similarity,
                  p25: version.p25,
                  p50: version.p50,
                  p75: version.p75,
                  p90: version.p90,
                  p100: version.p100,
                  country: version.benchmark_files?.country || "Unknown",
                  category: version.category || match.category
                })
              }
            } else {
              // Fallback to original match data
              const fullBenchmark = benchmarks.find((b: any) => b.id === match.benchmarkId)
              matchedBenchmarks.push({
                ...match,
                p25: fullBenchmark?.p25,
                p50: fullBenchmark?.p50,
                p75: fullBenchmark?.p75,
                p90: fullBenchmark?.p90,
                p100: fullBenchmark?.p100,
                country: fullBenchmark?.benchmark_files?.country || null,
                category: fullBenchmark?.category || match.category
              })
            }
          }

          results.push({
            lineItemId: lineItem.id,
            matches: matchedBenchmarks,
            bestMatch: output.bestMatchId ? matchedBenchmarks.find((m: any) => m.benchmarkId === output.bestMatchId) : matchedBenchmarks[0],
            flag: matchedBenchmarks.length > 1 ? "MULTIPLE_MATCHES" : "GREEN"
          })
        } else {
          results.push({
            lineItemId: lineItem.id,
            matches: [],
            bestMatch: null,
            flag: "NO_MATCH"
          })
        }
      } catch (aiError: any) {
        console.error("[v0] AI matching error for line item:", lineItem.id, aiError)
        results.push({
          lineItemId: lineItem.id,
          matches: [],
          bestMatch: null,
          flag: "NO_MATCH",
          error: aiError.message
        })
      }
    }

    // 4. Update assessment_comparisons with results - use ONLY flag column
    console.log("[v0] Updating", results.length, "comparison records")
    
    for (const result of results) {
      // Convert MULTIPLE_MATCHES to YELLOW since DB only allows GREEN/YELLOW/RED/NO_MATCH
      const validFlag = result.flag === "MULTIPLE_MATCHES" ? "YELLOW" : result.flag

      // Update ONLY the flag column - nothing else
      const { data: updated, error: updateError } = await supabase
        .from("assessment_comparisons")
        .update({ flag: validFlag })
        .eq("line_item_id", result.lineItemId)
        .select("id")
      
      console.log("[v0] Update result for", result.lineItemId, ":", updated?.length || 0, "rows, error:", updateError?.message)
      
      // If no rows were updated (comparison doesn't exist), insert one
      if (!updated || updated.length === 0) {
        console.log("[v0] No existing comparison, inserting...")
        const { error: insertError } = await supabase
          .from("assessment_comparisons")
          .insert({
            assessment_id: assessmentId,
            line_item_id: result.lineItemId,
            flag: validFlag
          })
        
        if (insertError) {
          console.log("[v0] Insert error:", insertError.message)
        } else {
          console.log("[v0] Inserted new comparison for", result.lineItemId)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Compared ${lineItems.length} line items against ${benchmarks.length} benchmarks`,
      results: results.map(r => ({
        lineItemId: r.lineItemId,
        matchCount: r.matches.length,
        flag: r.flag,
        matches: r.matches,
        bestMatch: r.bestMatch
      }))
    })

  } catch (error: any) {
    console.error("[v0] Benchmark comparison error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
