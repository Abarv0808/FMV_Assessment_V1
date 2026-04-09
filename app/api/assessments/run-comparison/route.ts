import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// =====================================================
// MATCHING UTILITY FUNCTIONS
// =====================================================

// Stopwords for text normalization
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", 
  "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
  "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "must", "shall", "can", "need", "per", "each", "all", "any", "both",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "also", "now", "etc"
])

// Category alias mapping for normalization
const CATEGORY_ALIASES: Record<string, string> = {
  // Procedures
  "procedures": "procedures",
  "procedure": "procedures",
  "proc": "procedures",
  "medical procedures": "procedures",
  "clinical procedures": "procedures",
  
  // Non-Procedures
  "non procedures": "non_procedures",
  "non-procedures": "non_procedures",
  "nonprocedures": "non_procedures",
  "non procedure": "non_procedures",
  "non-procedure": "non_procedures",
  "other costs": "non_procedures",
  "other": "non_procedures",
  
  // Site Costs
  "site costs": "site_costs",
  "site cost": "site_costs",
  "sitecosts": "site_costs",
  "site": "site_costs",
  "site fees": "site_costs",
  "site expenses": "site_costs",
  
  // Country Costs
  "country costs": "country_costs",
  "country cost": "country_costs",
  "countrycosts": "country_costs",
  "country": "country_costs",
  "regional costs": "country_costs",
  
  // Conditional Procedures
  "conditional procedures": "conditional_procedures",
  "conditional procedure": "conditional_procedures",
  "conditional": "conditional_procedures",
  
  // Personnel/Staff
  "personnel": "personnel",
  "staff": "personnel",
  "staffing": "personnel",
  "labor": "personnel",
  "labour": "personnel",
  
  // Lab/Tests
  "laboratory": "laboratory",
  "lab": "laboratory",
  "labs": "laboratory",
  "tests": "laboratory",
  "testing": "laboratory",
  "diagnostics": "laboratory",
}

// Normalize text: lowercase, trim, replace punctuation, remove stopwords
function normText(s: string): string {
  if (!s) return ""
  let normalized = s.toLowerCase().trim()
  // Replace punctuation with spaces
  normalized = normalized.replace(/[^\w\s]/g, " ")
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim()
  // Remove stopwords
  const words = normalized.split(" ").filter(w => !STOPWORDS.has(w) && w.length > 1)
  return words.join(" ")
}

// Normalize category using alias map
function normCat(s: string): string {
  if (!s) return ""
  const lower = s.toLowerCase().trim()
  return CATEGORY_ALIASES[lower] || lower.replace(/[^\w]/g, "_")
}

// Generate trigrams from text
function getTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>()
  const padded = `  ${text}  `
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.substring(i, i + 3))
  }
  return trigrams
}

// Calculate trigram cosine similarity
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

// Calculate category similarity (1 if match, 0 if not)
function categorySimilarity(vendorCat: string, benchmarkCat: string): number {
  const normVendor = normCat(vendorCat)
  const normBenchmark = normCat(benchmarkCat)
  return normVendor === normBenchmark ? 1 : 0
}

// Determine confidence level
function getConfidence(isStrict: boolean, textSim: number): "HIGH" | "MEDIUM" | "LOW" {
  if (isStrict && textSim >= 0.70) return "HIGH"
  if (isStrict || textSim >= 0.88) return "MEDIUM"
  return "LOW"
}

// =====================================================
// MATCHING INTERFACE
// =====================================================

interface MatchCandidate {
  benchmarkId: string
  procedureName: string
  category: string
  textSim: number
  catSim: number
  score: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
  isStrict: boolean
  p25: number | null
  p50: number | null
  p75: number | null
  p90: number | null
  p100: number | null
  country: string
}

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
      
      // Fetch benchmark procedures ONLY from selected countries/files
      console.log("[v0] Selected benchmark file IDs:", benchmarkFileIds?.length || 0, "files")
      
      // If user selected specific benchmark files, use ONLY those
      // This ensures we only compare against the countries they selected
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

      // Filter to ONLY the selected benchmark files (selected countries)
      if (benchmarkFileIds && benchmarkFileIds.length > 0) {
        benchmarkQuery = benchmarkQuery.in("benchmark_file_id", benchmarkFileIds)
        console.log("[v0] Filtering to selected benchmark files only")
      } else {
        // If no files selected, limit to first file to avoid massive query
        const { data: firstFile } = await supabase
          .from("benchmark_files")
          .select("id, country")
          .limit(1)
          .single()
        
        if (firstFile) {
          benchmarkQuery = benchmarkQuery.eq("benchmark_file_id", firstFile.id)
          console.log("[v0] No files selected, using fallback:", firstFile.country)
        }
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

    const results: any[] = []

    // 3. For each line item, use trigram + category matching algorithm
    for (const lineItem of lineItems) {
      // Parse description and extra data from procedure_name (format: "description|||{json}")
      const procedureName = lineItem.procedure_name || ""
      const [description, extraDataStr] = procedureName.split("|||")
      const cleanDescription = description.trim()
      
      // Parse extra data to get costCategory
      let vendorCostCategory = ""
      try {
        if (extraDataStr) {
          const extraData = JSON.parse(extraDataStr)
          vendorCostCategory = extraData.costCategory || ""
        }
      } catch (e) {
        // Ignore JSON parse errors
      }

      console.log("[v0] Processing line item:", `"${cleanDescription}"`, "| Category:", vendorCostCategory || "N/A")
      
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

      // Normalize vendor text for matching
      const normVendorText = normText(cleanDescription)
      const normVendorCat = normCat(vendorCostCategory)
      
      // Calculate similarity scores for all benchmarks
      const allCandidates: MatchCandidate[] = []
      
      for (const bm of benchmarks) {
        const normBenchmarkText = normText(bm.procedure_name || "")
        const normBenchmarkCat = normCat(bm.category || "")
        
        const textSim = trigramSimilarity(normVendorText, normBenchmarkText)
        const catSim = categorySimilarity(vendorCostCategory, bm.category || "")
        
        // Score: 0.75 * catSim + 0.25 * textSim
        const score = 0.75 * catSim + 0.25 * textSim
        
        allCandidates.push({
          benchmarkId: bm.id,
          procedureName: bm.procedure_name,
          category: bm.category || "Other",
          textSim,
          catSim,
          score,
          confidence: "LOW", // Will be updated
          isStrict: false,   // Will be updated
          p25: bm.p25,
          p50: bm.p50,
          p75: bm.p75,
          p90: bm.p90,
          p100: bm.p100,
          country: bm.benchmark_files?.country || "Unknown"
        })
      }
      
      // STRICT MATCHING: Category must match AND textSim >= 0.45
      const strictMatches = allCandidates
        .filter(c => c.catSim === 1 && c.textSim >= 0.45)
        .map(c => ({ ...c, isStrict: true, confidence: getConfidence(true, c.textSim) }))
        .sort((a, b) => b.textSim - a.textSim) // Sort by text similarity for strict
        .slice(0, 3)
      
      let finalMatches: MatchCandidate[] = []
      
      if (strictMatches.length > 0) {
        // Use strict matches
        finalMatches = strictMatches
        console.log("[v0] Found", strictMatches.length, "STRICT matches for:", cleanDescription.substring(0, 40))
      } else {
        // FALLBACK: Pure text similarity matching (categories don't align between vendor and benchmark data)
        // Lower threshold to 0.35 to catch more semantic matches
        const fallbackMatches = allCandidates
          .filter(c => c.textSim >= 0.35)
          .map(c => ({ 
            ...c, 
            isStrict: false, 
            confidence: c.textSim >= 0.70 ? "HIGH" : c.textSim >= 0.50 ? "MEDIUM" : "LOW"
          }))
          .sort((a, b) => b.textSim - a.textSim) // Sort by text similarity
          .slice(0, 3)
        
        finalMatches = fallbackMatches
        console.log("[v0] Found", fallbackMatches.length, "FALLBACK matches for:", cleanDescription.substring(0, 40))
      }
      
      // Log matches
      if (finalMatches.length > 0) {
        finalMatches.forEach((m, i) => {
          console.log(`[v0]   Match ${i + 1}: "${m.procedureName}" | TextSim: ${(m.textSim * 100).toFixed(1)}% | CatSim: ${m.catSim} | Confidence: ${m.confidence} | ${m.isStrict ? "STRICT" : "FALLBACK"}`)
        })
      }
      
      // Build result matches with similarity as percentage
      const matchedBenchmarks = finalMatches.map(m => ({
        benchmarkId: m.benchmarkId,
        procedureName: m.procedureName,
        similarity: m.textSim,
        textSimilarity: m.textSim,
        categorySimilarity: m.catSim,
        confidence: m.confidence,
        isStrict: m.isStrict,
        p25: m.p25,
        p50: m.p50,
        p75: m.p75,
        p90: m.p90,
        p100: m.p100,
        country: m.country,
        category: m.category
      }))

      // Determine flag based on results
      let flag = "NO_MATCH"
      if (matchedBenchmarks.length > 0) {
        const bestConfidence = matchedBenchmarks[0].confidence
        if (bestConfidence === "HIGH") {
          flag = "GREEN"
        } else if (bestConfidence === "MEDIUM") {
          flag = matchedBenchmarks.length > 1 ? "YELLOW" : "GREEN"
        } else {
          flag = "YELLOW"
        }
      }

      results.push({
        lineItemId: lineItem.id,
        matches: matchedBenchmarks,
        bestMatch: matchedBenchmarks[0] || null,
        flag
      })
    }

    // 4. Update assessment_comparisons with flag and ai_matches
    console.log("[v0] Updating", results.length, "comparison records")
    
    for (const result of results) {
      // Convert MULTIPLE_MATCHES to YELLOW since DB only allows GREEN/YELLOW/RED/NO_MATCH
      const validFlag = result.flag === "MULTIPLE_MATCHES" ? "YELLOW" : result.flag

      // Update assessment_comparisons with flag and ai_matches
      const { data: updated, error: updateError } = await supabase
        .from("assessment_comparisons")
        .update({ 
          flag: validFlag,
          ai_matches: result.matches || []
        })
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
            flag: validFlag,
            ai_matches: result.matches || []
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
