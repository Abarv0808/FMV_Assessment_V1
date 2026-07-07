// =====================================================
// FUZZY TEXT MATCHING
// Shared, deterministic matcher used by the benchmark comparison logic.
//
// Goal: a short / partial / mistyped vendor term should still find the right
// benchmark procedure. e.g. "Arch" -> "Archive" / "Archival" / "Archiving",
// and "arciv" (typo) -> "Archive".
//
// Strategy (per pair of strings):
//   1. Token coverage — every meaningful vendor word is scored against the
//      closest benchmark word using, in order:
//        a. equal stems            (archive/archiving -> "archiv")   = 1.00
//        b. prefix on stems        ("arch" is prefix of "archiv")    = 0.92
//        c. Levenshtein similarity (typo tolerance, "arciv"~"archive")
//      Vendor tokens are length-weighted so long, meaningful words dominate.
//   2. Trigram similarity of the whole strings (good for reordered/compound
//      phrases).
//   The final score is the higher of the two, so we get the best of both.
// =====================================================

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "as", "is", "was", "are", "were", "been", "be", "have",
  "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "must", "shall", "can", "need", "per", "each", "all", "any", "both",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "also", "now", "etc",
])

// Suffixes stripped (longest-first) to reduce a word to a comparable stem.
// Only stripped when the remaining stem stays >= 3 chars.
const SUFFIXES = [
  "izational", "izations", "ization", "ational", "iveness", "fulness",
  "ousness", " ability", "ibility", "ations", "ation", " items", "ings",
  "ing", "ional", "tional", "ative", "itive", "alize", "alise", "ical",
  "ally", "ies", "ied", "ives", "ive", " ment", "ment", "ness", "ance",
  "ence", "ual", "ary", "ory", "ers", "er", "ed", "es", "al", "ic", "ly",
  "s", "y",
].map((s) => s.trim())

export function normalizeText(s: string): string {
  if (!s) return ""
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
}

export function stemWord(word: string): string {
  let w = word
  for (const suf of SUFFIXES) {
    if (w.length > suf.length && w.endsWith(suf) && w.length - suf.length >= 3) {
      w = w.slice(0, w.length - suf.length)
      break
    }
  }
  return w
}

// Classic Levenshtein edit distance.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = new Array(b.length + 1)
  let curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

// 0..1 similarity based on edit distance (1 = identical).
export function levenshteinRatio(a: string, b: string): number {
  if (!a && !b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

// Score how well a single vendor word matches a single benchmark word.
function tokenScore(vToken: string, bToken: string): number {
  if (vToken === bToken) return 1

  const sv = stemWord(vToken)
  const sb = stemWord(bToken)

  if (sv === sb) return 1
  // Prefix on stems handles partial terms: "arch" -> "archiv(e/al/ing)".
  if (sv.length >= 3 && sb.length >= 3 && (sv.startsWith(sb) || sb.startsWith(sv))) {
    return 0.92
  }

  // Typo tolerance on the raw words (~<=30% edits).
  const r = levenshteinRatio(vToken, bToken)
  if (r >= 0.7) return r

  // Typo tolerance on the stems (slightly discounted).
  const rs = levenshteinRatio(sv, sb)
  if (rs >= 0.7) return rs * 0.95

  return 0
}

function getTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>()
  const padded = `  ${text}  `
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.substring(i, i + 3))
  }
  return trigrams
}

export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const ta = getTrigrams(a)
  const tb = getTrigrams(b)
  let intersection = 0
  for (const t of ta) if (tb.has(t)) intersection++
  const denominator = Math.sqrt(ta.size) * Math.sqrt(tb.size)
  return denominator === 0 ? 0 : intersection / denominator
}

// Length-weighted token coverage of the vendor text against the benchmark text.
function tokenCoverage(vendorText: string, benchmarkText: string): number {
  const vTokens = tokenize(vendorText)
  const bTokens = tokenize(benchmarkText)
  if (vTokens.length === 0 || bTokens.length === 0) return 0

  let weightedSum = 0
  let weightTotal = 0
  for (const v of vTokens) {
    let best = 0
    for (const b of bTokens) {
      const s = tokenScore(v, b)
      if (s > best) best = s
      if (best === 1) break
    }
    // Weight longer words more heavily so filler words don't dominate.
    const weight = v.length
    weightedSum += best * weight
    weightTotal += weight
  }
  return weightTotal === 0 ? 0 : weightedSum / weightTotal
}

/**
 * Overall fuzzy similarity between a vendor description and a benchmark
 * procedure name, in the range 0..1. Combines length-weighted token coverage
 * (stem + prefix + typo aware) with whole-string trigram similarity.
 */
export function fuzzyMatchScore(vendorText: string, benchmarkText: string): number {
  if (!vendorText || !benchmarkText) return 0
  const coverage = tokenCoverage(vendorText, benchmarkText)
  const trigram = trigramSimilarity(normalizeText(vendorText), normalizeText(benchmarkText))
  return Math.max(coverage, trigram)
}

// Map a 0..1 fuzzy score to the confidence buckets used by the comparison UI.
export function scoreToConfidence(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.8) return "HIGH"
  if (score >= 0.6) return "MEDIUM"
  return "LOW"
}
