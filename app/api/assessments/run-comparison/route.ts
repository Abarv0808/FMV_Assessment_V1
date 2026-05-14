import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { generateObject } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { z } from "zod"

// =====================================================
// AI-POWERED SEMANTIC MATCHING
// =====================================================

// Schema for AI match response
const MatchResultSchema = z.object({
  matches: z.array(z.object({
    benchmarkIndex: z.number().describe("Index of the matching benchmark procedure (0-based)"),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).describe("Confidence level of the match"),
    reasoning: z.string().describe("Brief explanation of why this is a match")
  })).describe("Top matching benchmark procedures (max 3)")
})

// Use AI to find semantic matches between a vendor item and benchmark procedures
async function findAIMatches(
  vendorDescription: string,
  vendorCategory: string,
  benchmarkProcedures: { id: string; name: string; category: string; index: number }[]
): Promise<{ benchmarkIndex: number; confidence: "HIGH" | "MEDIUM" | "LOW"; reasoning: string }[]> {
  
  // Prepare benchmark list for the prompt (limit to 100 to avoid token limits)
  const benchmarkList = benchmarkProcedures.slice(0, 100).map((bp, i) => 
    `${i}. "${bp.name}" (Category: ${bp.category || "Unknown"})`
  ).join("\n")

  try {
    const { object } = await generateObject({
      model: gateway("openai/gpt-4o-mini"),
      schema: MatchResultSchema,
      prompt: `You are an expert at matching clinical trial cost items to benchmark procedures for Fair Market Value (FMV) assessment.

VENDOR COST ITEM:
Description: "${vendorDescription}"
Category: "${vendorCategory || "Not specified"}"

BENCHMARK PROCEDURES (index. name):
${benchmarkList}

TASK: Find the TOP 3 benchmark procedures that best match the vendor cost item semantically. Consider:
1. Similar medical/clinical terminology
2. Same type of procedure, test, or service
3. Equivalent activities even if named differently

COMMON EQUIVALENT TERMS IN CLINICAL TRIALS:
- "Ethics Committee fee" / "Local Ethics" / "EC fee" = "IRB" / "Institutional Review Board" / "IRB/EC"
- "Study Coordinator" = "Clinical Research Coordinator" / "CRC"
- "Principal Investigator" = "PI" / "Lead Investigator"
- "Informed Consent" = "ICF" / "Consent Process"
- "Site Management" = "Site Overhead" / "Facility Fee"
- "Regulatory Affairs" = "Regulatory Submission" / "Compliance"
- "Data Management" = "Data Entry" / "CRF Completion"
- "Patient Stipend" = "Subject Compensation" / "Patient Reimbursement"

Return matches with confidence:
- HIGH: Clear semantic match, same procedure/service/fee type
- MEDIUM: Likely match, similar but not identical
- LOW: Possible match, requires review

IMPORTANT: Search carefully for regulatory, ethics, IRB, compliance related benchmarks when the vendor item mentions ethics committee, IRB, regulatory, or compliance fees.

If no reasonable matches exist, return an empty matches array.`
    })

    return object.matches || []
  } catch (error: any) {
    console.log("[v0] AI matching error:", error.message)
    return []
  }
}

// =====================================================
// FALLBACK: TRIGRAM-BASED MATCHING (if AI fails)
// =====================================================

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", 
  "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
  "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "must", "shall", "can", "need", "per", "each", "all", "any", "both",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "also", "now", "etc"
])

function normText(s: string): string {
  if (!s) return ""
  let normalized = s.toLowerCase().trim()
  normalized = normalized.replace(/[^\w\s]/g, " ")
  normalized = normalized.replace(/\s+/g, " ").trim()
  const words = normalized.split(" ").filter(w => !STOPWORDS.has(w) && w.length > 1)
  return words.join(" ")
}

function getTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>()
  const padded = `  ${text}  `
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.substring(i, i + 3))
  }
  return trigrams
}

function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const trigramsA = getTrigrams(a)
  const trigramsB = getTrigrams(b)
  
  let intersection = 0
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++
  }
  
  const denominator = Math.sqrt(trigramsA.size) * Math.sqrt(trigramsB.size)
  if (denominator === 0) return 0
  
  return intersection / denominator
}

// =====================================================
// MAIN API HANDLER
// =====================================================

export async function POST(request: Request) {
  console.log("[v0] Run comparison API called (AI-powered)")
  
  try {
    const body = await request.json()
    const { assessmentId, benchmarkFileIds } = body
    
    console.log("[v0] Assessment ID:", assessmentId)

    if (!assessmentId) {
      return NextResponse.json({ error: "Missing assessmentId" }, { status: 400 })
    }

    const supabase = createAdminClient()

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
    
    try {
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
        .limit(5000)

      if (benchmarkFileIds && benchmarkFileIds.length > 0) {
        benchmarkQuery = benchmarkQuery.in("benchmark_file_id", benchmarkFileIds)
        console.log("[v0] Filtering to selected benchmark files:", benchmarkFileIds.length)
      } else {
        // Load ALL benchmark procedures from all countries for country-specific matching
        console.log("[v0] Loading benchmarks from all countries for country-specific matching")
      }

      const result = await benchmarkQuery
      const rawBenchmarks = result.data || []
      
      // Filter out metadata rows
      const metadataLabels = ['study details', 'study code:', 'short name:', 'drug / compound:', 'title:', 
        'phase:', 'created:', 'modified:', 'budget type:', 'patient type:', 'indications (', 'study type',
        'visits:', 'screened:', 'sites:', 'overhead:', 'lab costs:', 'country details', 'single patient duration:',
        'study population type', 'sub total']
      
      benchmarks = rawBenchmarks.filter((bm: any) => {
        const name = (bm.procedure_name || "").toLowerCase().trim()
        if (!name || name.length < 2) return false
        if (metadataLabels.some(label => name.includes(label))) return false
        return true
      })
      
      // Log available countries in benchmark data
      const availableCountries = [...new Set(benchmarks.map((bm: any) => bm.benchmark_files?.country).filter(Boolean))]
      console.log("[v0] Benchmark procedures loaded:", benchmarks.length, "from", availableCountries.length, "countries")
      console.log("[v0] Available countries:", availableCountries.slice(0, 10).join(", "), availableCountries.length > 10 ? "..." : "")
    } catch (e: any) {
      console.log("[v0] Benchmark query exception:", e.message)
    }

    if (!benchmarks || benchmarks.length === 0) {
      console.log("[v0] No benchmark data found, marking all as NO_MATCH")
      
      for (const lineItem of lineItems) {
        const { data: existing } = await supabase
          .from("assessment_comparisons")
          .select("id")
          .eq("line_item_id", lineItem.id)
          .single()
        
        if (!existing) {
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
        message: `No benchmark data found. ${lineItems.length} items marked as NO_MATCH.`,
        results: lineItems.map(l => ({ lineItemId: l.id, matchCount: 0, flag: "NO_MATCH" }))
      })
    }

    // Prepare benchmark data for AI matching
    const benchmarkForAI = benchmarks.map((bm, index) => ({
      id: bm.id,
      name: bm.procedure_name,
      category: bm.category || "",
      index
    }))

    const results: any[] = []

    // 3. For each line item, use AI-powered semantic matching with country-specific filtering
    console.log("[v0] Starting AI-powered matching for", lineItems.length, "items...")
    
    for (const lineItem of lineItems) {
      const procedureName = lineItem.procedure_name || ""
      const [description, extraDataStr] = procedureName.split("|||")
      const cleanDescription = description.trim()
      
      // Get the country from the line item's site/country field
      const lineItemCountry = lineItem.country || ""
      
      let vendorCostCategory = ""
      try {
        if (extraDataStr) {
          const extraData = JSON.parse(extraDataStr)
          vendorCostCategory = extraData.costCategory || ""
        }
      } catch (e) {
        // Ignore JSON parse errors
      }

      console.log("[v0] Processing:", `"${cleanDescription.substring(0, 50)}..."`, "Country:", lineItemCountry || "ALL")
      
      if (!cleanDescription || cleanDescription === "Unknown") {
        results.push({
          lineItemId: lineItem.id,
          matches: [],
          bestMatch: null,
          flag: "NO_MATCH"
        })
        continue
      }

      // Filter benchmarks by country if the line item has a country specified
      let countryFilteredBenchmarks = benchmarks
      if (lineItemCountry) {
        countryFilteredBenchmarks = benchmarks.filter(bm => {
          const bmCountry = bm.benchmark_files?.country || ""
          return bmCountry.toLowerCase() === lineItemCountry.toLowerCase()
        })
        console.log("[v0] Filtered to", countryFilteredBenchmarks.length, "benchmarks for country:", lineItemCountry)
      }
      
      // If no country-specific benchmarks found, fall back to all benchmarks
      if (countryFilteredBenchmarks.length === 0) {
        console.log("[v0] No country-specific benchmarks found, using all benchmarks")
        countryFilteredBenchmarks = benchmarks
      }
      
      // Prepare country-filtered benchmark data for AI matching
      const countryBenchmarkForAI = countryFilteredBenchmarks.map((bm, index) => ({
        id: bm.id,
        name: bm.procedure_name,
        category: bm.category || "",
        index,
        originalIndex: benchmarks.indexOf(bm)
      }))

      // Try AI matching first
      let matchedBenchmarks: any[] = []
      
      try {
        const aiMatches = await findAIMatches(cleanDescription, vendorCostCategory, countryBenchmarkForAI)
        
        if (aiMatches.length > 0) {
          console.log("[v0] AI found", aiMatches.length, "matches for", lineItemCountry || "ALL")
          
          matchedBenchmarks = aiMatches.map(match => {
            const bm = countryFilteredBenchmarks[match.benchmarkIndex]
            if (!bm) return null
            
            return {
              benchmarkId: bm.id,
              procedureName: bm.procedure_name,
              similarity: match.confidence === "HIGH" ? 0.9 : match.confidence === "MEDIUM" ? 0.7 : 0.5,
              confidence: match.confidence,
              reasoning: match.reasoning,
              isAIMatch: true,
              p25: bm.p25,
              p50: bm.p50,
              p75: bm.p75,
              p90: bm.p90,
              p100: bm.p100,
              country: bm.benchmark_files?.country || "Unknown",
              category: bm.category || "Other"
            }
          }).filter(Boolean)
        }
      } catch (aiError: any) {
        console.log("[v0] AI matching failed, falling back to trigram:", aiError.message)
      }

      // Fallback to trigram matching if AI fails or returns no results
      if (matchedBenchmarks.length === 0) {
        console.log("[v0] Using trigram fallback for:", cleanDescription.substring(0, 30), "Country:", lineItemCountry || "ALL")
        
        const normVendorText = normText(cleanDescription)
        
        // Use country-filtered benchmarks for trigram matching too
        const trigramMatches = countryFilteredBenchmarks
          .map(bm => ({
            bm,
            similarity: trigramSimilarity(normVendorText, normText(bm.procedure_name || ""))
          }))
          .filter(m => m.similarity >= 0.35)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 3)
        
        matchedBenchmarks = trigramMatches.map(m => ({
          benchmarkId: m.bm.id,
          procedureName: m.bm.procedure_name,
          similarity: m.similarity,
          confidence: m.similarity >= 0.7 ? "HIGH" : m.similarity >= 0.5 ? "MEDIUM" : "LOW",
          reasoning: "Matched by text similarity",
          isAIMatch: false,
          p25: m.bm.p25,
          p50: m.bm.p50,
          p75: m.bm.p75,
          p90: m.bm.p90,
          p100: m.bm.p100,
          country: m.bm.benchmark_files?.country || "Unknown",
          category: m.bm.category || "Other"
        }))
      }

      // Determine flag based on results
      let flag = "NO_MATCH"
      if (matchedBenchmarks.length > 0) {
        const bestConfidence = matchedBenchmarks[0].confidence
        if (bestConfidence === "HIGH") {
          flag = "GREEN"
        } else if (bestConfidence === "MEDIUM") {
          flag = "YELLOW"
        } else {
          flag = "YELLOW"
        }
      }

      // Log matches
      if (matchedBenchmarks.length > 0) {
        matchedBenchmarks.forEach((m, i) => {
          console.log(`[v0]   Match ${i + 1}: "${m.procedureName?.substring(0, 40)}" | Confidence: ${m.confidence} | AI: ${m.isAIMatch}`)
        })
      }

      results.push({
        lineItemId: lineItem.id,
        matches: matchedBenchmarks,
        bestMatch: matchedBenchmarks[0] || null,
        flag
      })
    }

    // 4. Update assessment_comparisons with results
    console.log("[v0] Updating", results.length, "comparison records")
    
    for (const result of results) {
      console.log("[v0] Updating line_item_id:", result.lineItemId, "with", result.matches?.length || 0, "matches")
      
      const { data: updated, error: updateError } = await supabase
        .from("assessment_comparisons")
        .update({ 
          flag: result.flag,
          ai_matches: result.matches || []
        })
        .eq("line_item_id", result.lineItemId)
        .select("id")
      
      console.log("[v0] Update result:", updated?.length || 0, "rows updated, error:", updateError?.message || "none")
      
      if (!updated || updated.length === 0) {
        console.log("[v0] No existing record, inserting new one")
        const { error: insertError } = await supabase
          .from("assessment_comparisons")
          .insert({
            assessment_id: assessmentId,
            line_item_id: result.lineItemId,
            flag: result.flag,
            ai_matches: result.matches || []
          })
        console.log("[v0] Insert error:", insertError?.message || "none")
      }
    }

    const aiMatchCount = results.filter(r => r.matches.some((m: any) => m.isAIMatch)).length
    const fallbackCount = results.filter(r => r.matches.length > 0 && !r.matches.some((m: any) => m.isAIMatch)).length

    return NextResponse.json({
      success: true,
      message: `Compared ${lineItems.length} items: ${aiMatchCount} AI matches, ${fallbackCount} trigram matches`,
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
