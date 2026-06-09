import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { generateObject } from "ai"
import { z } from "zod"

// =====================================================
// AI-POWERED SEMANTIC MATCHING v9 - Gemini via AI Gateway
// =====================================================

// Model used via Vercel AI Gateway
const AI_MODEL = "google/gemini-3-pro-preview"

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
  benchmarkProcedures: { id: string; name: string; category: string; index: number }[],
  context: { country: string; lineItemId: string }
): Promise<{ benchmarkIndex: number; confidence: "HIGH" | "MEDIUM" | "LOW"; reasoning: string }[]> {

  const startTime = Date.now()
  const logPrefix = `[v0][AI-Gateway][${context.lineItemId.substring(0, 8)}]`

  // Prepare benchmark list for the prompt (limit to 150 to balance accuracy vs tokens)
  const limitedBenchmarks = benchmarkProcedures.slice(0, 150)
  const benchmarkList = limitedBenchmarks.map((bp, i) =>
    `${i}. "${bp.name}" (Category: ${bp.category || "Unknown"})`
  ).join("\n")

  console.log(`${logPrefix} Calling AI Gateway with model: ${AI_MODEL}`)
  console.log(`${logPrefix} Vendor item: "${vendorDescription.substring(0, 80)}" | Country: ${context.country} | Benchmarks: ${limitedBenchmarks.length}/${benchmarkProcedures.length}`)

  try {
    const { object, usage } = await generateObject({
      // AI SDK v6: pass model string directly; AI Gateway routes the request automatically
      model: AI_MODEL,
      schema: MatchResultSchema,
      prompt: `You are an expert at matching clinical trial cost items to benchmark procedures for Fair Market Value (FMV) assessment.

VENDOR COST ITEM:
Description: "${vendorDescription}"
Category: "${vendorCategory || "Not specified"}"
Country: "${context.country || "Not specified"}"

BENCHMARK PROCEDURES (index. name):
${benchmarkList}

TASK: Return ONLY benchmark procedures that are a TRUE semantic match for the vendor cost item — same activity, service, fee, or procedure type.

STRICT MATCHING RULES (read carefully):
1. A match must represent the SAME underlying work/service/fee. Not "loosely related," not "in the same general area."
2. If you are not at least 60% certain that the benchmark represents the same activity, DO NOT include it.
3. **Return an empty matches array** when:
   - The vendor item is a tax, VAT, sales tax, withholding tax, customs duty, or government levy.
   - The vendor item is a discount, rebate, or financial adjustment.
   - The vendor item is an overhead percentage, markup, management fee %, or admin %.
   - The vendor item is a currency conversion, exchange fee, bank fee, or wire transfer fee.
   - The vendor item is a generic line like "Miscellaneous", "Other", "Sundry", "Sub total", "Total".
   - No benchmark in the list represents the same procedure/service.
4. NEVER force a low-confidence match just to return something. An empty array is the correct answer when nothing fits.

CONFIDENCE LEVELS (only use after passing the strictness check above):
- HIGH: Clear, unambiguous match — same procedure or service, equivalent terminology.
- MEDIUM: Likely match — same type of activity but different naming convention.
- LOW: Use sparingly. Only when the activity is closely related (e.g., specialty variant of the same procedure). NEVER use LOW for taxes, overheads, discounts, fees-on-fees, or unrelated categories.

COMMON EQUIVALENT TERMS IN CLINICAL TRIALS (use these to RECOGNIZE matches, not invent them):
- "Ethics Committee fee" / "Local Ethics" / "EC fee" = "IRB" / "Institutional Review Board" / "IRB/EC"
- "Study Coordinator" = "Clinical Research Coordinator" / "CRC"
- "Principal Investigator" = "PI" / "Lead Investigator"
- "Informed Consent" = "ICF" / "Consent Process"
- "Site Management" = "Site Overhead" / "Facility Fee"
- "Regulatory Affairs" = "Regulatory Submission" / "Compliance"
- "Data Management" = "Data Entry" / "CRF Completion"
- "Patient Stipend" = "Subject Compensation" / "Patient Reimbursement"

Return up to 3 matches, sorted best-first. If nothing genuinely matches, return { "matches": [] }.`
    })

    const elapsedMs = Date.now() - startTime
    const matches = object.matches || []
    console.log(`${logPrefix} ✓ AI Gateway success in ${elapsedMs}ms | Matches: ${matches.length} | Tokens: prompt=${usage?.inputTokens ?? "?"} completion=${usage?.outputTokens ?? "?"} total=${usage?.totalTokens ?? "?"}`)

    return matches
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime

    // Detailed error logging for AI Gateway debugging
    console.error(`${logPrefix} ✗ AI Gateway FAILED after ${elapsedMs}ms`)
    console.error(`${logPrefix}   Error name: ${error?.name || "Unknown"}`)
    console.error(`${logPrefix}   Error message: ${error?.message || "No message"}`)
    if (error?.statusCode) console.error(`${logPrefix}   HTTP status: ${error.statusCode}`)
    if (error?.cause) console.error(`${logPrefix}   Cause: ${JSON.stringify(error.cause).substring(0, 500)}`)
    if (error?.responseBody) console.error(`${logPrefix}   Response body: ${String(error.responseBody).substring(0, 500)}`)
    if (error?.url) console.error(`${logPrefix}   Request URL: ${error.url}`)

    // Categorize common AI Gateway errors
    const msg = (error?.message || "").toLowerCase()
    if (msg.includes("credit card") || msg.includes("payment")) {
      console.error(`${logPrefix}   → DIAGNOSIS: AI Gateway requires payment method on file`)
    } else if (msg.includes("api key") || msg.includes("unauthorized") || error?.statusCode === 401) {
      console.error(`${logPrefix}   → DIAGNOSIS: AI Gateway authentication failed (check AI_GATEWAY_API_KEY)`)
    } else if (msg.includes("rate limit") || error?.statusCode === 429) {
      console.error(`${logPrefix}   → DIAGNOSIS: AI Gateway rate limit hit`)
    } else if (msg.includes("model") || error?.statusCode === 404) {
      console.error(`${logPrefix}   → DIAGNOSIS: Model "${AI_MODEL}" may not be available via AI Gateway`)
    } else if (msg.includes("timeout") || msg.includes("etimedout")) {
      console.error(`${logPrefix}   → DIAGNOSIS: AI Gateway request timed out`)
    } else if (msg.includes("fetch") || msg.includes("network")) {
      console.error(`${logPrefix}   → DIAGNOSIS: Network error reaching AI Gateway`)
    } else {
      console.error(`${logPrefix}   → DIAGNOSIS: Unknown error - falling back to trigram matching`)
    }

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
    const { assessmentId, benchmarkFileIds, decisionOverrides } = body as {
      assessmentId: string
      benchmarkFileIds?: string[]
      decisionOverrides?: Record<string, string>
    }
    
    console.log("[v0] Assessment ID:", assessmentId)
    if (decisionOverrides && Object.keys(decisionOverrides).length > 0) {
      console.log("[v0] Decision overrides received from client:", Object.keys(decisionOverrides).length, "items")
    }

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

    // 1b. Persist any decision overrides from the client BEFORE running the
    // comparison. This is the authoritative single-step write that bypasses
    // any client-side dropdown / persistence races: whatever the user has
    // selected in the UI right now wins.
    if (decisionOverrides && lineItems && lineItems.length > 0) {
      const overrideEntries = Object.entries(decisionOverrides)
      console.log("[v0] Persisting", overrideEntries.length, "decision overrides to DB before comparison")
      for (const [lineItemId, newDecision] of overrideEntries) {
        const li = lineItems.find((row: any) => row.id === lineItemId)
        if (!li) continue
        const procName: string = li.procedure_name || ""
        const sepIdx = procName.indexOf("|||")
        let desc = procName
        let extraData: any = {}
        if (sepIdx !== -1) {
          desc = procName.substring(0, sepIdx)
          try { extraData = JSON.parse(procName.substring(sepIdx + 3)) } catch { extraData = {} }
        }
        if (extraData.decision === newDecision) continue
        const previous = extraData.decision
        extraData.decision = newDecision
        const newProcName = `${desc}|||${JSON.stringify(extraData)}`
        const { error: persistError } = await supabase
          .from("assessment_line_items")
          .update({ procedure_name: newProcName })
          .eq("id", lineItemId)
        if (persistError) {
          console.log("[v0] Failed to persist decision for", lineItemId, persistError.message)
        } else {
          console.log("[v0] Persisted decision for", lineItemId.substring(0, 8), `"${previous}" -> "${newDecision}"`)
          // Update in-memory copy so downstream logic reads the new value
          li.procedure_name = newProcName
        }
      }
    }

    console.log("[v0] Line items found:", lineItems?.length, "Error:", lineItemsError?.message)

    if (lineItemsError || !lineItems || lineItems.length === 0) {
      return NextResponse.json({ error: "No line items found", details: lineItemsError?.message }, { status: 400 })
    }

    // 2. Fetch benchmark procedures from database
    console.log("[v0] Fetching benchmark procedures...")
    
    let benchmarks: any[] = []
    
    try {
      // Determine the file-id filter to apply BEFORE querying procedures.
      // PostgREST caps a single response at ~1000 rows, so we must paginate via .range()
      // to reliably retrieve all procedures across multiple countries.
      let fileIdFilter: string[] | null = null

      // Get unique countries from line items to only fetch needed benchmark data
      const lineItemCountries = [...new Set(lineItems.map((li: any) => li.country).filter(Boolean))]
      console.log("[v0] Line item countries:", lineItemCountries.join(", ") || "NONE")
      
      if (benchmarkFileIds && benchmarkFileIds.length > 0) {
        fileIdFilter = benchmarkFileIds
        console.log("[v0] Filtering to selected benchmark files:", benchmarkFileIds.length)
      } else if (lineItemCountries.length > 0) {
        // First, get benchmark_file IDs for the countries we need
        const { data: countryFiles, error: countryError } = await supabase
          .from("benchmark_files")
          .select("id, country")
          .in("country", lineItemCountries)
          .limit(5000)
        
        console.log("[v0] Benchmark files for requested countries:", countryFiles?.length || 0, "Error:", countryError?.message || "none")
        
        if (countryFiles && countryFiles.length > 0) {
          fileIdFilter = countryFiles.map(f => f.id)
          const uniqueCountries = [...new Set(countryFiles.map(f => f.country))]
          console.log("[v0] Filtering to", fileIdFilter.length, "benchmark files for countries:", uniqueCountries.join(", "))
        } else {
          console.log("[v0] No benchmark files found for:", lineItemCountries.join(", "))
        }
      } else {
        console.log("[v0] No countries in line items, loading sample benchmarks")
      }

      // Paginate through benchmark_procedures in 1000-row pages.
      // PostgREST hard-caps a single response at 1000 rows regardless of .limit().
      const PAGE_SIZE = 1000
      const MAX_PAGES = 50 // safety: up to 50,000 rows
      const rawBenchmarks: any[] = []
      
      for (let page = 0; page < MAX_PAGES; page++) {
        let pageQuery = supabase
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
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        
        if (fileIdFilter) {
          pageQuery = pageQuery.in("benchmark_file_id", fileIdFilter)
        }
        
        const { data: pageData, error: pageError } = await pageQuery
        
        if (pageError) {
          console.log("[v0] Benchmark page", page, "error:", pageError.message)
          break
        }
        
        if (!pageData || pageData.length === 0) break
        
        rawBenchmarks.push(...pageData)
        console.log("[v0] Loaded benchmark page", page + 1, "size:", pageData.length, "running total:", rawBenchmarks.length)
        
        if (pageData.length < PAGE_SIZE) break // last page
      }
      
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
      console.log("[v0] Available countries:", availableCountries.slice(0, 20).join(", "), availableCountries.length > 20 ? "..." : "")
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
      let lineItemDecision = ""
      try {
        if (extraDataStr) {
          const extraData = JSON.parse(extraDataStr)
          vendorCostCategory = extraData.costCategory || ""
          lineItemDecision = extraData.decision || ""
        }
      } catch (e) {
        // Ignore JSON parse errors
      }

      // If the client sent a fresh decision override (e.g. user changed it
      // and triggered Run Comparison before/while persistence was in flight),
      // prefer it over the value parsed from the DB.
      if (decisionOverrides && decisionOverrides[lineItem.id]) {
        const override = decisionOverrides[lineItem.id]
        if (override !== lineItemDecision) {
          console.log(`[v0] Decision override for ${lineItem.id.substring(0, 8)}: DB="${lineItemDecision}" -> override="${override}"`)
        }
        lineItemDecision = override
      }

      // Only run comparison for items with eligible decision statuses (In-review, Pending, or Escalate)
      // Skip items with statuses like Accepted, Not amended, Not accepted, Manual assessment.
      // "Escalate" stays eligible so escalated items are re-compared on every run.
      const eligibleDecisions = ["in-review", "pending", "escalate"]
      const decisionLower = lineItemDecision.toLowerCase().trim()
      if (lineItemDecision && !eligibleDecisions.includes(decisionLower)) {
        console.log(`[v0] Skipping item (decision="${lineItemDecision}" not eligible):`, cleanDescription.substring(0, 50))
        results.push({
          lineItemId: lineItem.id,
          matches: [],
          bestMatch: null,
          flag: "SKIPPED_BY_DECISION",
          skipReason: `Decision "${lineItemDecision}" is not eligible for comparison`
        })
        continue
      }

      console.log("[v0] Processing:", `"${cleanDescription.substring(0, 50)}..."`, "Country:", lineItemCountry || "ALL", "Decision:", lineItemDecision || "default")
      
      if (!cleanDescription || cleanDescription === "Unknown") {
        results.push({
          lineItemId: lineItem.id,
          matches: [],
          bestMatch: null,
          flag: "NO_MATCH"
        })
        continue
      }

      // Detect non-comparable items (taxes, discounts, overhead %, currency fees, etc.)
      // These have no procedure-level benchmark and should be flagged, not force-matched.
      const descLower = cleanDescription.toLowerCase()
      const nonComparablePatterns = [
        /\b(tax|vat|gst|sales\s*tax|withholding|customs|duty|levy|tariff)\b/,
        /\b(discount|rebate|refund|adjustment|credit\s*note)\b/,
        /\b(currency\s*conversion|exchange\s*fee|fx\s*fee|wire\s*fee|bank\s*fee)\b/,
        /^\s*(misc|miscellaneous|other|sundry|sub\s*total|subtotal|total|grand\s*total)\s*[:.]?\s*\d*\s*%?\s*$/,
        /^\s*[\d.,]+\s*%\s*$/, // bare percentage like "12%"
      ]
      const isNonComparable = nonComparablePatterns.some(rx => rx.test(descLower))
      if (isNonComparable) {
        console.log(`[v0] Non-comparable item detected (tax/discount/overhead/etc.), skipping match: "${cleanDescription.substring(0, 60)}"`)
        results.push({
          lineItemId: lineItem.id,
          matches: [],
          bestMatch: null,
          flag: "NON_COMPARABLE",
          skipReason: "Item is a tax, discount, overhead %, or other non-procedure cost with no direct benchmark"
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
      
      // If no country-specific benchmarks found, skip matching for this item
      if (countryFilteredBenchmarks.length === 0 && lineItemCountry) {
        console.log("[v0] No benchmarks available for country:", lineItemCountry)
        results.push({
          lineItemId: lineItem.id,
          matches: [],
          bestMatch: null,
          flag: "NO_BENCHMARK_DATA",
          noDataReason: `No benchmark data available for ${lineItemCountry}`
        })
        continue
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
        const aiMatches = await findAIMatches(
          cleanDescription,
          vendorCostCategory,
          countryBenchmarkForAI,
          { country: lineItemCountry, lineItemId: lineItem.id }
        )
        
        if (aiMatches.length > 0) {
          console.log("[v0] AI found", aiMatches.length, "matches for", lineItemCountry || "ALL")
          
          matchedBenchmarks = aiMatches.map(match => {
            const bm = countryFilteredBenchmarks[match.benchmarkIndex]
            if (!bm) return null
            
            return {
              benchmarkId: bm.id,
              procedureName: bm.procedure_name,
              code: bm.procedure_code || null,
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
          code: m.bm.procedure_code || null,
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

    // DB has a check constraint allowing only a small set of flag values.
    // Map any extended flags to a constraint-safe value for persistence,
    // while preserving the original flag in ai_matches metadata for the UI.
    const ALLOWED_DB_FLAGS = new Set(["GREEN", "YELLOW", "RED", "NO_MATCH", "MULTIPLE_MATCHES"])
    const toDbFlag = (f: string) => (ALLOWED_DB_FLAGS.has(f) ? f : "NO_MATCH")

    for (const result of results) {
      // PRESERVE PRIOR BENCHMARK DATA FOR DECISION-FINALIZED ITEMS.
      // When an item's decision was changed (e.g. to "Accepted") after a reviewer
      // examined the matched benchmark, it is excluded from re-comparison and comes
      // back as SKIPPED_BY_DECISION with no matches. We must NOT overwrite the
      // existing comparison record, otherwise the benchmark data that the decision
      // was based on would be lost on every re-run. Leave any existing record intact.
      if (result.flag === "SKIPPED_BY_DECISION") {
        const { data: existing } = await supabase
          .from("assessment_comparisons")
          .select("id")
          .eq("line_item_id", result.lineItemId)
          .maybeSingle()

        if (existing) {
          console.log("[v0] Preserving existing benchmark data for decision-finalized item:", result.lineItemId)
          continue
        }

        // No prior record exists (decision was already finalized before any
        // comparison ran). Insert a sentinel so the UI shows "no comparison needed".
        console.log("[v0] No prior record for skipped item, inserting sentinel:", result.lineItemId)
        await supabase
          .from("assessment_comparisons")
          .insert({
            assessment_id: assessmentId,
            line_item_id: result.lineItemId,
            flag: "NO_MATCH",
            ai_matches: [{ __meta: true, originalFlag: result.flag, skipReason: (result as any).skipReason || null }]
          })
        continue
      }

      console.log("[v0] Updating line_item_id:", result.lineItemId, "with", result.matches?.length || 0, "matches", "flag:", result.flag)

      const dbFlag = toDbFlag(result.flag)
      // Stash the original (extended) flag inside ai_matches as a sentinel so the UI can read it.
      const aiMatchesPayload: any = result.matches && result.matches.length > 0
        ? result.matches
        : [{ __meta: true, originalFlag: result.flag, skipReason: (result as any).skipReason || null }]

      const { data: updated, error: updateError } = await supabase
        .from("assessment_comparisons")
        .update({
          flag: dbFlag,
          ai_matches: aiMatchesPayload
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
            flag: dbFlag,
            ai_matches: aiMatchesPayload
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
