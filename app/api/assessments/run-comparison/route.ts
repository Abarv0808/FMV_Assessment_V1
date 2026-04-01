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

    // 2. Fetch benchmark procedures from selected files or all files
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
      
      // Now fetch with full data
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
          benchmark_file_id
        `)
        .limit(500)

      if (benchmarkFileIds && benchmarkFileIds.length > 0) {
        benchmarkQuery = benchmarkQuery.in("benchmark_file_id", benchmarkFileIds)
      }

      const result = await benchmarkQuery
      benchmarks = result.data || []
      benchmarksError = result.error
      
      console.log("[v0] Benchmark query result:", benchmarks.length, "procedures found")
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

        if (output && output.matches && output.matches.length > 0) {
          // Get full benchmark data for matched items
          const matchedBenchmarks = output.matches.map((match: any) => {
            const fullBenchmark = benchmarks.find((b: any) => b.id === match.benchmarkId)
            return {
              ...match,
              p25: fullBenchmark?.p25,
              p50: fullBenchmark?.p50,
              p75: fullBenchmark?.p75,
              p90: fullBenchmark?.p90,
              p100: fullBenchmark?.p100,
              benchmarkFile: fullBenchmark?.benchmark_files
            }
          })

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

    // 4. Update assessment_comparisons with results
    console.log("[v0] Updating", results.length, "comparison records")
    
    for (const result of results) {
      // Only use columns that we know exist in the DB
      const updateData: any = {
        flag: result.flag,
        possible_matches: result.matches.length > 0 ? JSON.stringify(result.matches) : null,
        ai_description: result.bestMatch 
          ? `${result.bestMatch.procedureName} (${Math.round(result.bestMatch.similarity * 100)}% match)`
          : "No matching benchmark found"
      }

      // Try to update existing record
      const { data: updated, error: updateError } = await supabase
        .from("assessment_comparisons")
        .update(updateData)
        .eq("line_item_id", result.lineItemId)
        .select()
      
      console.log("[v0] Update result for", result.lineItemId, ":", updated?.length || 0, "rows, error:", updateError?.message)
      
      // If no rows were updated, try to insert
      if (!updated || updated.length === 0) {
        console.log("[v0] No existing comparison found, inserting new one")
        const { error: insertError } = await supabase
          .from("assessment_comparisons")
          .insert({
            assessment_id: assessmentId,
            line_item_id: result.lineItemId,
            ...updateData
          })
        
        if (insertError) {
          console.log("[v0] Insert error:", insertError.message)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Compared ${lineItems.length} line items against ${benchmarks.length} benchmarks`,
      results: results.map(r => ({
        lineItemId: r.lineItemId,
        matchCount: r.matches.length,
        flag: r.flag
      }))
    })

  } catch (error: any) {
    console.error("[v0] Benchmark comparison error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
