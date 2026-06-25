// Country normalization utilities.
//
// Line-item countries come straight from the vendor Excel "Site"/"Country"
// column and are often abbreviations or variants ("US", "U.S.", "USA",
// "UK", "Korea"), while benchmark files store full canonical names
// ("United States", "United Kingdom", "South Korea"). Matching them with a
// naive `===` causes every line item to be flagged NO_BENCHMARK_DATA even
// when benchmark data exists. These helpers resolve both sides to a shared
// canonical key so they compare correctly.

// Groups of equivalent country spellings. The FIRST entry in each group is
// treated as the canonical name. Add new aliases here as templates surface them.
const COUNTRY_ALIAS_GROUPS: string[][] = [
  ["United States", "United States of America", "USA", "US", "U.S.", "U.S.A.", "America"],
  ["United Kingdom", "UK", "U.K.", "Great Britain", "Britain", "England"],
  ["South Korea", "Korea", "Korea, Republic of", "Republic of Korea", "KR"],
  ["North Korea", "Korea, Democratic People's Republic of"],
  ["United Arab Emirates", "UAE", "U.A.E."],
  ["Russia", "Russian Federation"],
  ["Czech Republic", "Czechia"],
  ["Macedonia", "North Macedonia"],
  ["Hong Kong", "Hong Kong SAR", "Hong Kong SAR China"],
  ["Taiwan", "Taiwan, Province of China", "Chinese Taipei"],
  ["Vietnam", "Viet Nam"],
  ["Slovakia", "Slovak Republic"],
  ["Netherlands", "The Netherlands", "Holland"],
  ["Türkiye", "Turkey", "Turkiye"],
  ["Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire"],
  ["Bolivia", "Bolivia, Plurinational State of"],
  ["Venezuela", "Venezuela, Bolivarian Republic of"],
  ["Iran", "Iran, Islamic Republic of"],
  ["Tanzania", "Tanzania, United Republic of"],
  ["Moldova", "Republic of Moldova"],
]

// Build a lookup from any lowercased alias -> canonical key (the group's first
// entry, lowercased). Anything not in a group resolves to itself.
const ALIAS_TO_CANONICAL: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const group of COUNTRY_ALIAS_GROUPS) {
    const canonical = group[0].toLowerCase()
    for (const alias of group) {
      map[normalizeRaw(alias)] = canonical
    }
  }
  return map
})()

function normalizeRaw(value: string): string {
  return value
    .toLowerCase()
    .replace(/[._]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Resolve a country string to a canonical comparison key. Unknown countries
 * resolve to their own normalized form so unrelated countries never collide.
 */
export function canonicalCountry(value: string | null | undefined): string {
  if (!value) return ""
  const raw = normalizeRaw(value)
  return ALIAS_TO_CANONICAL[raw] ?? raw
}

/** True when two country strings refer to the same country, despite spelling. */
export function countriesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalCountry(a)
  const cb = canonicalCountry(b)
  return ca !== "" && ca === cb
}

/**
 * Given a country string, return every known spelling variant (original cased
 * forms from the alias group) so we can widen a database `IN (...)` query.
 * Always includes the original input. Used to query benchmark_files.country
 * which may store any of the variants.
 */
export function countryQueryVariants(value: string | null | undefined): string[] {
  if (!value) return []
  const canonical = canonicalCountry(value)
  const group = COUNTRY_ALIAS_GROUPS.find((g) => g[0].toLowerCase() === canonical)
  const variants = new Set<string>()
  variants.add(value.trim())
  if (group) {
    for (const alias of group) variants.add(alias)
  }
  return Array.from(variants)
}
