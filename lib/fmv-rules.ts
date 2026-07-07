// FMV Domain-Knowledge Matching Layer — rules engine.
//
// Deterministic, hard-enforced rules applied AFTER AI/fuzzy matching so the
// comparison engine reflects FMV domain knowledge that plain text matching
// cannot infer (e.g. "CRA -> Monitoring", "project manager -> Administrative",
// "PhD student -> always link Data Entry", "IRB/EC submission -> initial fee by
// default"). Rules are editable via the admin UI (three DB tables).

import type { SupabaseClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SynonymRule {
  id: string
  label: string
  triggers: string[]
  match_mode: "word" | "substring"
  target_codes: string[]
  target_keywords: string[]
  is_mandatory: boolean
  priority: number
  enabled: boolean
  notes?: string | null
}

export interface TherapeuticArea {
  id: string
  name: string
  aliases: string[]
  enabled: boolean
}

export interface DisambiguationOverride {
  keywords: string[]
  codes: string[]
}

export interface DisambiguationRule {
  id: string
  label: string
  triggers: string[]
  default_codes: string[]
  overrides: DisambiguationOverride[]
  priority: number
  enabled: boolean
  notes?: string | null
}

export interface MatchingRules {
  synonymRules: SynonymRule[]
  therapeuticAreas: TherapeuticArea[]
  disambiguationRules: DisambiguationRule[]
}

// Minimal shape of a benchmark row from `benchmark_procedures` (+ joined file).
export interface BenchmarkRow {
  id: string
  procedure_name: string
  procedure_code?: string | null
  category?: string | null
  p25?: number | null
  p50?: number | null
  p75?: number | null
  p90?: number | null
  p100?: number | null
  benchmark_files?: { country?: string } | null
}

// Shape of a match object as produced by run-comparison/route.ts.
export interface BenchmarkMatch {
  benchmarkId: string
  procedureName: string
  code: string | null
  similarity: number
  confidence: "HIGH" | "MEDIUM" | "LOW"
  reasoning: string
  isAIMatch: boolean
  isRuleMatch?: boolean
  p25?: number | null
  p50?: number | null
  p75?: number | null
  p90?: number | null
  p100?: number | null
  country: string
  category: string
}

const MAX_MATCHES = 5

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Load all matching rules once per comparison run. Degrades gracefully: if the
 * tables don't exist yet (migrations not run) or a query fails, returns empty
 * rule sets so the comparison pipeline is a no-op rather than throwing.
 */
export async function loadMatchingRules(supabase: SupabaseClient): Promise<MatchingRules> {
  const empty: MatchingRules = { synonymRules: [], therapeuticAreas: [], disambiguationRules: [] }
  try {
    const [syn, ta, dis] = await Promise.all([
      supabase.from("fmv_synonym_rules").select("*").eq("enabled", true).order("priority", { ascending: true }),
      supabase.from("fmv_therapeutic_areas").select("*").eq("enabled", true),
      supabase.from("fmv_disambiguation_rules").select("*").eq("enabled", true).order("priority", { ascending: true }),
    ])

    if (syn.error || ta.error || dis.error) {
      console.log(
        "[v0] loadMatchingRules: table(s) unavailable (run migrations 013/014?):",
        syn.error?.message || ta.error?.message || dis.error?.message,
      )
      return empty
    }

    return {
      synonymRules: (syn.data || []).map(normalizeSynonymRow),
      therapeuticAreas: (ta.data || []).map((r: any) => ({
        id: r.id,
        name: r.name || "",
        aliases: toStringArray(r.aliases),
        enabled: !!r.enabled,
      })),
      disambiguationRules: (dis.data || []).map(normalizeDisambiguationRow),
    }
  } catch (e: any) {
    console.log("[v0] loadMatchingRules failed:", e?.message)
    return empty
  }
}

function normalizeSynonymRow(r: any): SynonymRule {
  return {
    id: r.id,
    label: r.label || "",
    triggers: toStringArray(r.triggers),
    match_mode: r.match_mode === "substring" ? "substring" : "word",
    target_codes: toStringArray(r.target_codes),
    target_keywords: toStringArray(r.target_keywords),
    is_mandatory: !!r.is_mandatory,
    priority: typeof r.priority === "number" ? r.priority : 100,
    enabled: !!r.enabled,
    notes: r.notes ?? null,
  }
}

function normalizeDisambiguationRow(r: any): DisambiguationRule {
  let overrides: DisambiguationOverride[] = []
  try {
    const raw = typeof r.overrides === "string" ? JSON.parse(r.overrides) : r.overrides
    if (Array.isArray(raw)) {
      overrides = raw
        .map((o: any) => ({ keywords: toStringArray(o?.keywords), codes: toStringArray(o?.codes) }))
        .filter(o => o.keywords.length > 0 && o.codes.length > 0)
    }
  } catch {
    overrides = []
  }
  return {
    id: r.id,
    label: r.label || "",
    triggers: toStringArray(r.triggers),
    default_codes: toStringArray(r.default_codes),
    overrides,
    priority: typeof r.priority === "number" ? r.priority : 100,
    enabled: !!r.enabled,
    notes: r.notes ?? null,
  }
}

function toStringArray(v: any): string[] {
  if (Array.isArray(v)) return v.map(x => String(x)).filter(Boolean)
  if (typeof v === "string" && v.trim()) {
    // Support comma-separated strings as a convenience.
    return v.split(",").map(s => s.trim()).filter(Boolean)
  }
  return []
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim()
}

/** Whole-word / phrase-boundary match (default) or plain substring match. */
function hasTrigger(description: string, trigger: string, mode: "word" | "substring"): boolean {
  const d = normalize(description)
  const t = normalize(trigger)
  if (!t) return false
  if (mode === "substring") return d.includes(t)
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i")
  return re.test(d)
}

function anyTrigger(description: string, triggers: string[], mode: "word" | "substring"): boolean {
  return triggers.some(t => hasTrigger(description, t, mode))
}

/** Resolve benchmark rows by exact procedure_code, preserving code order. */
function resolveByCodes(benchmarks: BenchmarkRow[], codes: string[]): BenchmarkRow[] {
  const out: BenchmarkRow[] = []
  for (const code of codes.map(c => normalize(c))) {
    const bm = benchmarks.find(b => normalize(b.procedure_code || "") === code)
    if (bm && !out.includes(bm)) out.push(bm)
  }
  return out
}

/** Resolve benchmark rows whose name contains any of the keywords. */
function resolveByKeywords(benchmarks: BenchmarkRow[], keywords: string[]): BenchmarkRow[] {
  const out: BenchmarkRow[] = []
  for (const kw of keywords.map(k => normalize(k))) {
    if (!kw) continue
    const bm = benchmarks.find(b => normalize(b.procedure_name || "").includes(kw))
    if (bm && !out.includes(bm)) out.push(bm)
  }
  return out
}

function matchFromBenchmark(
  bm: BenchmarkRow,
  reasoning: string,
  confidence: "HIGH" | "MEDIUM" | "LOW" = "HIGH",
): BenchmarkMatch {
  return {
    benchmarkId: bm.id,
    procedureName: bm.procedure_name,
    code: bm.procedure_code || null,
    similarity: confidence === "HIGH" ? 0.95 : confidence === "MEDIUM" ? 0.7 : 0.5,
    confidence,
    reasoning,
    isAIMatch: false,
    isRuleMatch: true,
    p25: bm.p25,
    p50: bm.p50,
    p75: bm.p75,
    p90: bm.p90,
    p100: bm.p100,
    country: bm.benchmark_files?.country || "Unknown",
    category: bm.category || "Other",
  }
}

function dedupeById(matches: BenchmarkMatch[]): BenchmarkMatch[] {
  const seen = new Set<string>()
  return matches.filter(m => {
    if (seen.has(m.benchmarkId)) return false
    seen.add(m.benchmarkId)
    return true
  })
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface ApplyRulesArgs {
  description: string
  countryBenchmarks: BenchmarkRow[]
  currentMatches: BenchmarkMatch[]
  rules: MatchingRules
}

export interface ApplyRulesResult {
  matches: BenchmarkMatch[]
  appliedRules: string[]
}

/**
 * Apply domain rules to the AI/fuzzy match list. Rule-injected matches are
 * placed at the front (so they become the best match / drive the GREEN flag),
 * existing matches are preserved after them, then the list is deduped and
 * capped. Mandatory rules are always ensured present regardless of AI/fuzzy.
 */
export function applyMatchingRules({
  description,
  countryBenchmarks,
  currentMatches,
  rules,
}: ApplyRulesArgs): ApplyRulesResult {
  const appliedRules: string[] = []
  if (!description || countryBenchmarks.length === 0) {
    return { matches: currentMatches, appliedRules }
  }

  // Front-loaded, rule-injected matches (highest precedence first).
  const forced: BenchmarkMatch[] = []
  const mandatory: BenchmarkMatch[] = []

  // 1) Disambiguation rules — pick a default benchmark from a family, overridden
  //    by keywords (e.g. IRB/EC -> initial by default, amendment/renewal/etc.).
  for (const rule of [...rules.disambiguationRules].sort((a, b) => a.priority - b.priority)) {
    if (!rule.enabled) continue
    if (!anyTrigger(description, rule.triggers, "word")) continue

    let chosenCodes: string[] | null = null
    let via = "default"
    for (const ov of rule.overrides) {
      if (anyTrigger(description, ov.keywords, "word")) {
        chosenCodes = ov.codes
        via = `override[${ov.keywords.join("/")}]`
        break
      }
    }
    if (!chosenCodes) chosenCodes = rule.default_codes

    const resolved = resolveByCodes(countryBenchmarks, chosenCodes)
    if (resolved.length > 0) {
      for (const bm of resolved) forced.push(matchFromBenchmark(bm, `Business rule: ${rule.label} (${via})`))
      appliedRules.push(`${rule.label} -> ${via} -> ${chosenCodes.join(",")}`)
      console.log(`[v0] Disambiguation rule fired: "${rule.label}" (${via}) -> ${chosenCodes.join(",")}`)
    } else {
      console.log(`[v0] Disambiguation rule "${rule.label}" matched but codes ${chosenCodes.join(",")} not in benchmark set (re-upload?)`)
    }
  }

  // 2) Synonym / role rules — map vendor terms to benchmark targets.
  for (const rule of [...rules.synonymRules].sort((a, b) => a.priority - b.priority)) {
    if (!rule.enabled) continue
    if (!anyTrigger(description, rule.triggers, rule.match_mode)) continue

    let resolved = resolveByCodes(countryBenchmarks, rule.target_codes)
    if (resolved.length === 0) resolved = resolveByKeywords(countryBenchmarks, rule.target_keywords)

    if (resolved.length === 0) {
      console.log(`[v0] Synonym rule "${rule.label}" matched but no target benchmark resolved (re-upload?)`)
      continue
    }

    const bucket = rule.is_mandatory ? mandatory : forced
    for (const bm of resolved) bucket.push(matchFromBenchmark(bm, `Business rule: ${rule.label}`))
    appliedRules.push(`${rule.label}${rule.is_mandatory ? " (mandatory)" : ""}`)
    console.log(`[v0] Synonym rule fired: "${rule.label}"${rule.is_mandatory ? " [mandatory]" : ""} -> ${resolved.map(b => b.procedure_code).join(",")}`)
  }

  // 3) Therapeutic-area preference — when the description mentions a physician/
  //    specialist AND a TA, prefer the TA-specific physician benchmark.
  const mentionsPhysician = /(^|[^a-z])(physician|specialist|consultant)([^a-z]|$)/i.test(normalize(description))
  if (mentionsPhysician) {
    for (const ta of rules.therapeuticAreas) {
      if (!ta.enabled) continue
      const taTerms = [ta.name, ...ta.aliases]
      const taPresent = taTerms.some(term => hasTrigger(description, term, "word"))
      if (!taPresent) continue
      // Find a benchmark that is BOTH a physician benchmark AND for this TA.
      const taName = normalize(ta.name)
      const specific = countryBenchmarks.find(b => {
        const n = normalize(b.procedure_name || "")
        return n.includes("physician") && n.includes(taName)
      })
      if (specific) {
        forced.unshift(matchFromBenchmark(specific, `Business rule: TA-specific physician (${ta.name})`))
        appliedRules.push(`TA-specific physician: ${ta.name}`)
        console.log(`[v0] TA preference fired: physician + ${ta.name} -> ${specific.procedure_code}`)
        break
      }
    }
  }

  if (forced.length === 0 && mandatory.length === 0) {
    return { matches: currentMatches, appliedRules }
  }

  // Assemble: forced (rule best-matches) -> existing -> mandatory (always kept).
  // Dedupe by benchmark id, then cap. Mandatory are appended AFTER the cap slice
  // of the rest so they are never dropped.
  const combined = dedupeById([...forced, ...currentMatches])
  const capped = combined.slice(0, MAX_MATCHES)

  // Ensure mandatory matches are present even if they'd fall outside the cap.
  const finalMatches = [...capped]
  for (const m of mandatory) {
    if (!finalMatches.some(x => x.benchmarkId === m.benchmarkId)) {
      finalMatches.push(m)
    }
  }

  return { matches: dedupeById(finalMatches), appliedRules }
}
