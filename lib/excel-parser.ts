import * as XLSX from "xlsx"
import type { AssessmentLineItem } from "./types"

// ============================================
// BUDGET TEMPLATE PARSING (FMV Template Tab)
// ============================================

// Column header mappings for the "FMV Template" tab.
// The exact header strings expected in the budget template are listed first;
// a few legacy aliases are kept so older files still parse.
const FMV_COLUMN_MAPPINGS = {
  country: ["Country", "Site", "Site (Optional)", "Site Name"],
  costCategory: ["Cost Category", "Cost category", "Cost category (dropdown)"],
  description: ["Description", "Description of costs", "Additional Information"],
  unitType: ["Unit Type", "Unit Type (dropdown)"],
  numberOfUnits: ["Number of units", "Number of Units", "Number of Units (number)", "Qty", "Quantity"],
  unitPrice: ["Unit Price", "Unit Price (overhead not included, number)", "Rate", "Price"],
  totalCost: ["Total Cost", "Total cost", "Total Cost (automatically calculated)", "Total"],
  currency: ["Currency", "Currency (dropdown)"],
  takedaSupported: ["Takeda supported", "Takeda supported (optional, dropdown)"],
  costType: ["Type of cost", "Type of cost (FMV lead)"],
  acceptedUnitPrice: ["Accepted Unit Price", "Accepted Unit Price (FMV lead)"],
  acceptedTotalCost: ["Accepted Total Costs", "Accepted Total Costs (FMV lead)"],
  decision: ["Takeda Decision", "Takeda Decision (FMV lead)"],
} as const

export interface ParsedVendorProposal {
  lineItems: AssessmentLineItem[]
  country: string | null
  metadata: {
    sheetName: string
    rowCount: number
    parsedAt: string
    skippedSummaryRows?: number
    includedWithoutDescription?: number
  }
}

// Find header row and map column indices.
// More forgiving than a strict equals: we normalise whitespace/newlines (Excel
// often wraps headers like "Accepted Unit Price\n(FMV lead)"), then match in
// two passes — exact equality first, then containment — so short cells like
// "i" or "1" can't accidentally match a long header via reverse-includes.
function findSponsorHeaders(
  data: (string | number | undefined)[][],
): { headerRowIndex: number; columnMap: Record<string, number>; matchedColumns: number } | null {
  // Real Takeda templates can have a long preamble (form ID, version,
  // effective date, instructions, section labels) before the budget table
  // headers appear. Scan generously.
  const SCAN_DEPTH = Math.min(80, data.length)
  console.log("[v0] findSponsorHeaders: scanning", SCAN_DEPTH, "rows of", data.length)

  let best: { headerRowIndex: number; columnMap: Record<string, number>; matchedColumns: number } | null = null

  for (let rowIndex = 0; rowIndex < SCAN_DEPTH; rowIndex++) {
    const row = data[rowIndex]
    if (!row || row.length === 0) continue

    const columnMap: Record<string, number> = {}
    let matchedColumns = 0

    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const cellValue = String(row[colIndex] ?? "")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
      if (!cellValue || cellValue.length < 3) continue // ignore stray short cells

      // Pass 1: exact match
      let matched = false
      for (const [fieldName, possibleHeaders] of Object.entries(FMV_COLUMN_MAPPINGS)) {
        if (columnMap[fieldName] !== undefined) continue
        for (const header of possibleHeaders) {
          if (cellValue === header.toLowerCase()) {
            columnMap[fieldName] = colIndex
            matchedColumns++
            matched = true
            break
          }
        }
        if (matched) break
      }
      if (matched) continue

      // Pass 2: containment (cell may carry suffixes like "(FMV lead)" or
      // "(dropdown)"). One-directional only: cell INCLUDES known header.
      for (const [fieldName, possibleHeaders] of Object.entries(FMV_COLUMN_MAPPINGS)) {
        if (columnMap[fieldName] !== undefined) continue
        for (const header of possibleHeaders) {
          if (cellValue.includes(header.toLowerCase())) {
            columnMap[fieldName] = colIndex
            matchedColumns++
            break
          }
        }
      }
    }

    console.log("[v0] row", rowIndex, "matched", matchedColumns, "→", Object.keys(columnMap).join(","))

    if (matchedColumns >= 3 && (!best || matchedColumns > best.matchedColumns)) {
      best = { headerRowIndex: rowIndex, columnMap, matchedColumns }
    }
  }

  if (best) {
    console.log("[v0] best header row:", best.headerRowIndex, "with", best.matchedColumns, "columns")
    return best
  }

  console.log("[v0] no header row reached the 3-column threshold")
  return null
}

// Build a small human-readable preview of the sheet for diagnostic errors.
function previewSheet(data: (string | number | undefined)[][], rows = 3, cols = 8): string {
  return data
    .slice(0, rows)
    .map((row, i) => {
      const cells = (row || [])
        .slice(0, cols)
        .map((c) => String(c ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 30))
      return `row ${i}: [${cells.map((c) => `"${c}"`).join(", ")}]`
    })
    .join(" | ")
}

// Parse a number from Excel cell
function parseNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return 0
  if (typeof value === "number") return value
  
  const cleaned = String(value).trim().replace(/,/g, "").replace(/[$€£¥]/g, "")
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

// Generate a unique ID
function generateId(): string {
  return `li-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Parse budget Excel file from the "FMV Template" tab.
 * Maps Excel columns to AssessmentLineItem fields based on the mapping:
 * - Excel "Country" → country
 * - Excel "Cost Category" → costCategory
 * - Excel "Description" → description (Cost Description)
 * - Excel "Unit Type" → unitType
 * - Excel "Number of units" → numberOfUnits
 * - Excel "Unit Price" → unitPrice
 * - Excel "Total Cost" → totalCost (fetched directly from the workbook)
 * - Excel "Currency" → currency
 * - Excel "Takeda Decision" → decision
 */
export function parseVendorProposal(buffer: ArrayBuffer, assessmentId: string = ""): ParsedVendorProposal {
  console.log("[v0] parseVendorProposal: Starting to parse Excel file")
  const workbook = XLSX.read(buffer, { type: "array" })
  
  console.log("[v0] Available sheets in workbook:", workbook.SheetNames)
  
  // Find the "FMV Template" sheet (case-insensitive). This tab is required.
  let sponsorSheet: XLSX.WorkSheet | null = null
  let sponsorSheetName = ""
  
  for (const sheetName of workbook.SheetNames) {
    const normalized = sheetName.toLowerCase().replace(/\s+/g, " ").trim()
    if (normalized.includes("fmv template") || normalized === "fmv") {
      sponsorSheet = workbook.Sheets[sheetName]
      sponsorSheetName = sheetName
      console.log("[v0] Found FMV Template sheet:", sheetName)
      break
    }
  }
  
  // The "FMV Template" tab is mandatory — fail clearly if it's missing.
  if (!sponsorSheet) {
    throw new Error(
      `Could not find an "FMV Template" tab in the workbook. ` +
        `Available sheets: ${workbook.SheetNames.join(", ")}. ` +
        `Please upload a budget file that contains the "FMV Template" tab.`,
    )
  }
  
  // Convert sheet to array of arrays
  const data: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sponsorSheet, { header: 1 })
  console.log("[v0] Sheet data has", data.length, "rows")
  
  // Log first few rows for debugging
  if (data.length > 0) {
    console.log("[v0] First 5 rows of data:")
    for (let i = 0; i < Math.min(5, data.length); i++) {
      console.log("[v0] Row", i, ":", JSON.stringify(data[i]?.slice(0, 8)))
    }
  }
  
  // Find headers
  const headerInfo = findSponsorHeaders(data)
  
  if (!headerInfo) {
    // Find the row with the most non-empty long-text cells — likeliest header
    // candidate — and surface it so the user can see why it failed to match.
    let bestRow = -1
    let bestCount = 0
    for (let i = 0; i < Math.min(80, data.length); i++) {
      const row = data[i] || []
      const count = row.filter((c) => String(c ?? "").trim().length >= 4).length
      if (count > bestCount) {
        bestCount = count
        bestRow = i
      }
    }
    const candidatePreview =
      bestRow >= 0
        ? `Row ${bestRow} (most likely header row) contains: [${(data[bestRow] || [])
            .slice(0, 14)
            .map((c) => `"${String(c ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)}"`)
            .join(", ")}]`
        : "No row with text content was found."
    throw new Error(
      `Could not locate the header row in the "${sponsorSheetName}" sheet (scanned 80 rows). ` +
        `Expected columns: Country, Cost Category, Description, Unit Type, Number of units, Unit Price, Total Cost, Currency, Takeda Decision. ` +
        `Available sheets: ${workbook.SheetNames.join(", ")}. ` +
        candidatePreview,
    )
  }
  
  const { headerRowIndex, columnMap } = headerInfo
  const lineItems: AssessmentLineItem[] = []
  let extractedCountry: string | null = null

  // Column indices that carry real line-item data. Used to decide whether a row
  // is a genuine spacer (truly blank) vs. a data row that just happens to be
  // missing a description.
  const dataCols = [
    columnMap.description, columnMap.country, columnMap.costCategory,
    columnMap.unitType, columnMap.numberOfUnits, columnMap.unitPrice, columnMap.totalCost,
  ].filter((c): c is number => c !== undefined)

  const isBlankRow = (row: (string | number | undefined)[]): boolean => {
    if (dataCols.length === 0) return (row || []).every((c) => String(c ?? "").trim() === "")
    return dataCols.every((c) => String(row[c] ?? "").trim() === "")
  }

  // Detect a subtotal/total SUMMARY row by EXACT label match (never substring),
  // so legitimate descriptions like "Document Storage, Archiving Total Cost" are
  // NOT dropped.
  const SUMMARY_LABELS = new Set([
    "total", "subtotal", "sub-total", "sub total", "grand total",
    "total cost", "total costs", "grand total cost", "grand total costs",
  ])
  const isSummaryRow = (row: (string | number | undefined)[], desc: string): boolean => {
    const d = desc.toLowerCase().trim()
    if (SUMMARY_LABELS.has(d)) return true
    if (!d && SUMMARY_LABELS.has(String(row[0] ?? "").toLowerCase().trim())) return true
    return false
  }

  // Diagnostics so nothing is ever dropped silently. We tolerate spacer rows
  // inside the table and only stop after a real run of blank rows.
  const MAX_CONSECUTIVE_BLANK = 8
  let consecutiveBlank = 0
  let skippedSummaryRows = 0
  let includedWithoutDescription = 0

  // Parse data rows (skip header row).
  for (let rowIndex = headerRowIndex + 1; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]

    // Blank / spacer row: skip it but KEEP scanning. Only stop after a long run
    // of consecutive blank rows (reliable end-of-table signal) so a single
    // spacer row can never truncate the rest of the proposal.
    if (!row || row.length === 0 || isBlankRow(row)) {
      consecutiveBlank++
      if (consecutiveBlank >= MAX_CONSECUTIVE_BLANK) {
        console.log("[v0] Reached", MAX_CONSECUTIVE_BLANK, "consecutive blank rows at", rowIndex, "- end of table")
        break
      }
      continue
    }
    consecutiveBlank = 0

    const description = columnMap.description !== undefined ? String(row[columnMap.description] || "").trim() : ""

    // Skip genuine subtotal/total summary rows (exact match only).
    if (isSummaryRow(row, description)) {
      skippedSummaryRows++
      console.log("[v0] Skipping summary/subtotal row", rowIndex)
      continue
    }

    // A row with data but no description is NOT dropped — we fall back to the
    // cost category (or a placeholder) so the line item survives and stays
    // visible/editable instead of vanishing.
    let effectiveDescription = description
    if (!effectiveDescription) {
      const catFallback = columnMap.costCategory !== undefined ? String(row[columnMap.costCategory] || "").trim() : ""
      effectiveDescription = catFallback || "(no description provided)"
      includedWithoutDescription++
      console.log("[v0] Row", rowIndex, "has no description; keeping with fallback:", effectiveDescription)
    }

    // Extract Country value
    const countryValue = columnMap.country !== undefined ? String(row[columnMap.country] || "").trim() : ""
    
    // Capture the first non-empty Country value as the country for the assessment
    if (!extractedCountry && countryValue) {
      extractedCountry = countryValue
      console.log("[v0] Extracted country from Country column:", extractedCountry)
    }
    
    const lineItem: AssessmentLineItem = {
      id: generateId(),
      assessmentId,
      country: countryValue,
      costCategory: columnMap.costCategory !== undefined ? String(row[columnMap.costCategory] || "").trim() : "",
      description: effectiveDescription,
      unitType: columnMap.unitType !== undefined ? String(row[columnMap.unitType] || "").trim() : "",
      numberOfUnits: columnMap.numberOfUnits !== undefined ? parseNumber(row[columnMap.numberOfUnits]) : 0,
      unitPrice: columnMap.unitPrice !== undefined ? parseNumber(row[columnMap.unitPrice]) : 0,
      totalCost: columnMap.totalCost !== undefined ? parseNumber(row[columnMap.totalCost]) : 0,
      currency: columnMap.currency !== undefined ? String(row[columnMap.currency] || "USD").trim() : "USD",
      takedaSupported: columnMap.takedaSupported !== undefined ? String(row[columnMap.takedaSupported] || "").trim() : undefined,
      costType: columnMap.costType !== undefined ? String(row[columnMap.costType] || "").trim() : undefined,
      acceptedUnitPrice: columnMap.acceptedUnitPrice !== undefined ? parseNumber(row[columnMap.acceptedUnitPrice]) : undefined,
      acceptedTotalCost: columnMap.acceptedTotalCost !== undefined ? parseNumber(row[columnMap.acceptedTotalCost]) : undefined,
      // Default to "To Assess" when the Excel template has no Takeda Decision.
      // Items in this state are still eligible for benchmark comparison.
      decision: "To Assess",
      // Initialize benchmark fields
      benchmarkLow: undefined,
      benchmarkMed: undefined,
      benchmarkHigh: undefined,
      benchmark90th: undefined,
      variance: undefined,
      flag: null,
      benchmarkDescription: undefined,
      takedaQuestions: [],
      investigatorResponses: []
    }
    
    // Parse decision if present. Excel templates aren't strict about this
    // column — values like "to assess", "in review", "to be assessed",
    // "accept", "reject" all show up in real files. Normalise to one of
    // the canonical dropdown values; default unknown/empty text to "To Assess".
    if (columnMap.decision !== undefined && row[columnMap.decision]) {
      const raw = String(row[columnMap.decision]).trim()
      if (raw) {
        const normalized = raw.toLowerCase().replace(/[\s_-]+/g, " ").trim()
        const decisionMap: Record<string, string> = {
          "to assess": "To Assess",
          "to be assessed": "To Assess",
          "in review": "In-review",
          "in-review": "In-review",
          "to be reviewed": "In-review",
          "review": "In-review",
          "accepted": "Accepted",
          "accept": "Accepted",
          "approved": "Accepted",
          "pending": "Pending",
          "not amended": "Not amended",
          "no change": "Not amended",
          "unchanged": "Not amended",
          "not accepted": "Not accepted",
          "rejected": "Not accepted",
          "reject": "Not accepted",
          "manual assessment": "Manual assessment",
          "manual": "Manual assessment",
          "not applicable": "Not Applicable",
          "n/a": "Not Applicable",
          "na": "Not Applicable",
          "escalate": "Escalate",
          "escalated": "Escalate",
          "escalation": "Escalate",
        }
        lineItem.decision = (decisionMap[normalized] ?? "To Assess") as typeof lineItem.decision
      }
    }
    
    lineItems.push(lineItem)
  }

  console.log(
    "[v0] parseVendorProposal done:", lineItems.length, "line items;",
    skippedSummaryRows, "summary rows skipped;",
    includedWithoutDescription, "kept without a description",
  )

  return {
    lineItems,
    country: extractedCountry,
    metadata: {
      sheetName: sponsorSheetName,
      rowCount: lineItems.length,
      parsedAt: new Date().toISOString(),
      skippedSummaryRows,
      includedWithoutDescription,
    }
  }
}

// ============================================
// BENCHMARK FILE PARSING (Original Functions)
// ============================================

export interface ParsedProcedure {
  code: string
  name: string
  category: "Procedures" | "Non Procedures" | "Site Costs" | "Country Costs" | "Conditional Procedures"
  quantity: number
  overhead: string
  total: number
  p25: number | null
  p50: number | null
  p75: number | null
  p90: number | null
  p100: number | null
  sourceRef: string
}

export interface ParsedCountryData {
  country: string
  currency: string
  procedures: ParsedProcedure[]
  metadata: {
    screened?: number
    visits?: number
    sites?: number
    overhead?: string
    labCosts?: string
    budgetColumn?: string
  }
}

export interface ParsedBenchmarkFile {
  studyCode: string
  phase: string
  budgetType: string
  patientType: string
  countries: ParsedCountryData[]
  createdDate?: string
  modifiedDate?: string
}

// Parse a number from IQVIA format (e.g., " 7,050" -> 7050)
function parseIQVIANumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value === "number") return value
  
  // Remove spaces, quotes, and commas, then parse
  const cleaned = String(value).trim().replace(/,/g, "").replace(/"/g, "")
  if (cleaned === "" || cleaned === "0") return 0
  
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

// Country to Currency mapping
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  'Albania': 'ALL',
  'Argentina': 'USD',
  'Australia': 'AUD',
  'Austria': 'EUR',
  'Belgium': 'EUR',
  'Bosnia-Hercegovina': 'BAM',
  'Brazil': 'BRL',
  'Bulgaria': 'BGN',
  'Cambodia': 'KHR',
  'Canada': 'CAD',
  'Chile': 'CLP',
  'China': 'CNY',
  'Colombia': 'COP',
  'Croatia': 'EUR',
  'Cyprus': 'EUR',
  'Czech Republic': 'CZK',
  'Denmark': 'DKK',
  'Egypt': 'EGP',
  'Estonia': 'EUR',
  'Finland': 'EUR',
  'France': 'EUR',
  'Germany': 'EUR',
  'Greece': 'EUR',
  'Hong Kong': 'HKD',
  'Hungary': 'HUF',
  'Iceland': 'ISK',
  'India': 'INR',
  'Ireland': 'EUR',
  'Israel': 'NIS',
  'Italy': 'EUR',
  'Japan': 'JPY',
  'Kazakhstan': 'KZT',
  'Kuwait': 'KWD',
  'Latvia': 'EUR',
  'Lebanon': 'LBP',
  'Lithuania': 'EUR',
  'Macedonia': 'MKD',
  'Malta': 'EUR',
  'Mexico': 'MXN',
  'Morocco': 'MAD',
  'Netherlands': 'EUR',
  'Norway': 'NOK',
  'Oman': 'OMR',
  'Peru': 'PEN',
  'Poland': 'PLN',
  'Portugal': 'EUR',
  'Qatar': 'QAR',
  'Romania': 'RON',
  'Russia': 'RUB',
  'Saudi Arabia': 'SAR',
  'Serbia': 'RSD',
  'Singapore': 'SGD',
  'Slovak Republic': 'EUR',
  'Slovenia': 'EUR',
  'South Africa': 'ZAR',
  'South Korea': 'KRW',
  'Spain': 'EUR',
  'Sweden': 'SEK',
  'Switzerland': 'CHF',
  'Taiwan': 'TWD',
  'Tanzania': 'TZS',
  'Thailand': 'THB',
  'Tunisia': 'TND',
  'Turkey': 'USD',
  'United Arab Emirates': 'AED',
  'United Kingdom': 'GBP',
  'United States': 'USD',
  'Venezuela': 'USD',
  'Vietnam': 'VND',
}

// Extract currency code from subtotal row text
function extractCurrencyFromSubtotal(text: string): string | null {
  // Match patterns like "Procedures Sub Total (USD)" or "Site Costs Sub Total (EUR)"
  const match = text.match(/\(([A-Z]{3})\)/)
  return match ? match[1] : null
}

// Get currency by country name (case-insensitive matching)
function getCurrencyByCountry(country: string): string {
  // Try exact match first
  if (COUNTRY_CURRENCY_MAP[country]) {
    return COUNTRY_CURRENCY_MAP[country]
  }
  
  // Try case-insensitive match
  const countryLower = country.toLowerCase()
  for (const [key, value] of Object.entries(COUNTRY_CURRENCY_MAP)) {
    if (key.toLowerCase() === countryLower) {
      return value
    }
  }
  
  // Default to USD if not found
  return 'USD'
}

// Detect section headers in the data
function detectSectionStart(row: (string | number | undefined)[]): { type: string; country: string } | null {
  const firstCell = String(row[0] || "").trim()
  
  // Match patterns like "Procedures (93)", "Non Procedures (69)", "Site Costs (86)"
  const proceduresMatch = firstCell.match(/^(Procedures|Non Procedures|Site Costs|Country Costs|Conditional Procedures)\s*\((\d+)\)$/i)
  if (proceduresMatch) {
    // Extract country from second cell
    const countryCell = String(row[1] || "").trim()
    const countryMatch = countryCell.match(/^([A-Za-z\s]+)\s+Sub-Study/i)
    const country = countryMatch ? countryMatch[1].trim() : countryCell.split("Sub-Study")[0].trim()
    
    return {
      type: proceduresMatch[1],
      country: country || "Unknown"
    }
  }
  
  // Match "Country Details" section
  if (firstCell === "Country Details") {
    const countryCell = String(row[1] || "").trim()
    const countryMatch = countryCell.match(/^([A-Za-z\s]+)\s+Sub-Study/i)
    return {
      type: "Country Details",
      country: countryMatch ? countryMatch[1].trim() : countryCell.split("Sub-Study")[0].trim()
    }
  }
  
  return null
}

// Check if row is a header row for procedure data
function isHeaderRow(row: (string | number | undefined)[]): boolean {
  const firstCell = String(row[0] || "").toLowerCase().trim()
  const secondCell = String(row[1] || "").toLowerCase().trim()
  return firstCell === "code" && (secondCell.includes("procedure") || secondCell.includes("site cost") || secondCell.includes("non procedure"))
}

// Check if row is a data row (has a code in first column AND a proper procedure name)
function isDataRow(row: (string | number | undefined)[]): boolean {
  const firstCell = String(row[0] || "").trim()
  const secondCell = String(row[1] || "").trim()
  
  // Data rows must have a code in first column
  if (!firstCell || firstCell === "") return false
  
  // Skip section headers and metadata
  const firstCellLower = firstCell.toLowerCase()
  if (firstCellLower.includes("sub total")) return false
  if (firstCellLower.includes("procedures")) return false
  if (firstCellLower.includes("site costs")) return false
  if (firstCellLower.includes("country costs")) return false
  if (firstCellLower.includes("country details")) return false
  if (firstCellLower.includes("study details")) return false
  if (firstCellLower === "code") return false // Skip header row
  
  // Skip metadata labels in procedure name column
  const metadataLabels = [
    "study code:", "short name:", "drug / compound:", "title:", "budget type:",
    "phase:", "patient type:", "study type:", "study population type:", "icd code",
    "indications", "screened:", "visits:", "sites:", "overhead:", "lab costs:",
    "created:", "modified:", "grant negotiator:", "budget column", "sub-studies",
    "screened per site:", "single patient duration:", "countries:"
  ]
  const secondCellLower = secondCell.toLowerCase()
  if (metadataLabels.some(label => secondCellLower.includes(label) || secondCellLower === label.replace(":", ""))) {
    return false
  }
  
  // Must have a non-empty procedure name
  if (!secondCell || secondCell.length < 2) return false
  
  return true
}

export function parseExcelFile(buffer: ArrayBuffer): ParsedBenchmarkFile {
  const workbook = XLSX.read(buffer, { type: "array" })
  
  // Get the first sheet (or iterate through all sheets)
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  
  // Convert sheet to array of arrays
  const data: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  
  const result: ParsedBenchmarkFile = {
    studyCode: "",
    phase: "",
    budgetType: "",
    patientType: "",
    countries: []
  }
  
  // Parse study details from top rows
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i]
    const firstCell = String(row[0] || "").trim()
    const secondCell = String(row[1] || "").trim()
    
    if (firstCell === "Study Code:") result.studyCode = secondCell
    if (firstCell === "Phase:") result.phase = secondCell
    if (firstCell === "Budget Type:") result.budgetType = secondCell
    if (firstCell === "Patient Type:") result.patientType = secondCell
    if (firstCell === "Created:") result.createdDate = secondCell
    if (firstCell === "Modified:") result.modifiedDate = secondCell
  }
  
  // Track current parsing state
  let currentCountry: ParsedCountryData | null = null
  let currentSection: string | null = null
  let expectingHeader = false
  let expectingData = false
  
  const countriesMap = new Map<string, ParsedCountryData>()
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length === 0) continue
    
    // Check for section start
    const section = detectSectionStart(row)
    if (section) {
      currentSection = section.type
      
      // Get or create country data
      if (!countriesMap.has(section.country)) {
        countriesMap.set(section.country, {
          country: section.country,
          currency: "USD", // Default, will be extracted from subtotal rows
          procedures: [],
          metadata: {}
        })
      }
      currentCountry = countriesMap.get(section.country)!
      
      // Parse country details metadata
      if (section.type === "Country Details") {
        // Look ahead for metadata
        for (let j = i + 1; j < Math.min(i + 15, data.length); j++) {
          const metaRow = data[j]
          const key = String(metaRow[0] || "").trim()
          const value = String(metaRow[1] || "").trim()
          
          if (key === "Screened:") currentCountry.metadata.screened = parseInt(value) || 0
          if (key === "Visits:") currentCountry.metadata.visits = parseInt(value) || 0
          if (key === "Sites:") currentCountry.metadata.sites = parseInt(value) || 0
          if (key === "Overhead:") currentCountry.metadata.overhead = value
          if (key === "Lab Costs:") currentCountry.metadata.labCosts = value
          if (key === "Budget Column") currentCountry.metadata.budgetColumn = value
          
          // Stop at next section
          if (detectSectionStart(metaRow)) break
        }
        currentSection = null
        continue
      }
      
      expectingHeader = true
      expectingData = false
      continue
    }
    
    // Skip header row
    if (expectingHeader && isHeaderRow(row)) {
      expectingHeader = false
      expectingData = true
      continue
    }
    
    // Parse data rows
    if (expectingData && currentCountry && currentSection && isDataRow(row)) {
      const category = currentSection as ParsedProcedure["category"]
      
      const procedure: ParsedProcedure = {
        code: String(row[0] || "").trim(),
        name: String(row[1] || "").trim(),
        category,
        quantity: parseIQVIANumber(row[2]) || 1,
        overhead: String(row[3] || "").trim(),
        total: parseIQVIANumber(row[4]) || 0,
        p25: parseIQVIANumber(row[5]),
        p50: parseIQVIANumber(row[6]),
        p75: parseIQVIANumber(row[7]),
        p90: parseIQVIANumber(row[8]),
        p100: parseIQVIANumber(row[9]),
        sourceRef: String(row[10] || "").trim()
      }
      
      currentCountry.procedures.push(procedure)
    }
    
    // Check if we've hit a sub-total row (end of section)
    const firstCell = String(row[0] || "").trim()
    const firstCellLower = firstCell.toLowerCase()
    if (firstCellLower.includes("sub total")) {
      // Extract currency from subtotal row (e.g., "Procedures Sub Total (USD)")
      const currency = extractCurrencyFromSubtotal(firstCell)
      if (currency && currentCountry) {
        currentCountry.currency = currency
      }
      expectingData = false
      currentSection = null
    }
  }
  
  result.countries = Array.from(countriesMap.values())
  
  return result
}

// Parse multiple sheets (each sheet = a country)
export function parseExcelFileMultiSheet(buffer: ArrayBuffer): ParsedBenchmarkFile {
  const workbook = XLSX.read(buffer, { type: "array" })
  
  const result: ParsedBenchmarkFile = {
    studyCode: "",
    phase: "",
    budgetType: "",
    patientType: "",
    countries: []
  }
  
  // Filter out sheets to skip
  const countrySheets = workbook.SheetNames.filter(sheetName => {
    const sheetNameLower = sheetName.toLowerCase().trim()
    return !(
      sheetNameLower.includes("summary") || 
      sheetNameLower.includes("overview") ||
      sheetNameLower.includes("contents") ||
      sheetNameLower === "all" ||
      sheetNameLower === "all countries"
    )
  })
  
  // If only one valid country sheet, use single sheet parser
  if (countrySheets.length === 1) {
    const singleSheetResult = parseExcelFile(buffer)
    if (singleSheetResult.countries.length > 0) {
      return singleSheetResult
    }
  }
  
  // Parse each country sheet separately
  for (const sheetName of countrySheets) {
    
    const sheet = workbook.Sheets[sheetName]
    const data: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    
    // Parse this sheet assuming it's a country
    const countryData: ParsedCountryData = {
      country: sheetName.trim(),
      currency: "USD", // Default, will be extracted from subtotal rows
      procedures: [],
      metadata: {}
    }
    
    let currentSection: string | null = null
    let expectingHeader = false
    let expectingData = false
    
    // Also extract study metadata from first sheet
    if (workbook.SheetNames.indexOf(sheetName) === 0) {
      for (let i = 0; i < Math.min(20, data.length); i++) {
        const row = data[i]
        const firstCell = String(row[0] || "").trim()
        const secondCell = String(row[1] || "").trim()
        
        if (firstCell === "Study Code:") result.studyCode = secondCell
        if (firstCell === "Phase:") result.phase = secondCell
        if (firstCell === "Budget Type:") result.budgetType = secondCell
        if (firstCell === "Patient Type:") result.patientType = secondCell
      }
    }
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length === 0) continue
      
      const section = detectSectionStart(row)
      if (section && section.type !== "Country Details") {
        currentSection = section.type
        expectingHeader = true
        expectingData = false
        continue
      }
      
      if (expectingHeader && isHeaderRow(row)) {
        expectingHeader = false
        expectingData = true
        continue
      }
      
      if (expectingData && currentSection && isDataRow(row)) {
        const category = currentSection as ParsedProcedure["category"]
        
        const procedure: ParsedProcedure = {
          code: String(row[0] || "").trim(),
          name: String(row[1] || "").trim(),
          category,
          quantity: parseIQVIANumber(row[2]) || 1,
          overhead: String(row[3] || "").trim(),
          total: parseIQVIANumber(row[4]) || 0,
          p25: parseIQVIANumber(row[5]),
          p50: parseIQVIANumber(row[6]),
          p75: parseIQVIANumber(row[7]),
          p90: parseIQVIANumber(row[8]),
          p100: parseIQVIANumber(row[9]),
          sourceRef: String(row[10] || "").trim()
        }
        
        countryData.procedures.push(procedure)
      }
      
      const firstCell = String(row[0] || "").trim()
      const firstCellLower = firstCell.toLowerCase()
      
      // Check for subtotal rows to end section
      const isSubtotalRow = firstCellLower.includes("sub total") || 
                            firstCellLower.includes("subtotal") ||
                            firstCellLower.includes("sub-total") ||
                            (firstCellLower.includes("procedure") && firstCellLower.includes("total"))
      
      if (isSubtotalRow) {
        expectingData = false
        currentSection = null
      }
    }
    
    // Set currency from country mapping (much more reliable than parsing)
    countryData.currency = getCurrencyByCountry(countryData.country)
    
    if (countryData.procedures.length > 0) {
      result.countries.push(countryData)
    }
  }
  
  return result
}
