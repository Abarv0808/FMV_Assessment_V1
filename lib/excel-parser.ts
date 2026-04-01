import * as XLSX from "xlsx"
import type { AssessmentLineItem } from "./types"

// ============================================
// VENDOR PROPOSAL PARSING (Sponsor Tab)
// ============================================

// Column header mappings for the Sponsor tab
const SPONSOR_COLUMN_MAPPINGS = {
  site: ["Site", "Site (Optional)", "Site Name"],
  costCategory: ["Cost category", "Cost Category", "Cost category (dropdown)"],
  description: ["Description of costs", "Description", "Additional Information"],
  unitType: ["Unit Type", "Unit Type (dropdown)"],
  numberOfUnits: ["Number of Units", "Number of units", "Number of Units (number)", "Qty", "Quantity"],
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
  metadata: {
    sheetName: string
    rowCount: number
    parsedAt: string
  }
}

// Find header row and map column indices
function findSponsorHeaders(data: (string | number | undefined)[][]): { headerRowIndex: number; columnMap: Record<string, number> } | null {
  console.log("[v0] findSponsorHeaders: Searching through", Math.min(20, data.length), "rows")
  
  for (let rowIndex = 0; rowIndex < Math.min(20, data.length); rowIndex++) {
    const row = data[rowIndex]
    if (!row || row.length === 0) continue
    
    const columnMap: Record<string, number> = {}
    let matchedColumns = 0
    
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      // Normalize cell value - remove line breaks and extra spaces
      const rawValue = row[colIndex]
      const cellValue = String(rawValue || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
      if (!cellValue) continue
      
      // Check each mapping
      for (const [fieldName, possibleHeaders] of Object.entries(SPONSOR_COLUMN_MAPPINGS)) {
        for (const header of possibleHeaders) {
          const headerLower = header.toLowerCase()
          if (cellValue.includes(headerLower) || headerLower.includes(cellValue)) {
            if (columnMap[fieldName] === undefined) {
              columnMap[fieldName] = colIndex
              matchedColumns++
              console.log("[v0] Matched column", colIndex, "->", fieldName, "via header:", header)
            }
            break
          }
        }
      }
    }
    
    console.log("[v0] Row", rowIndex, "matched", matchedColumns, "columns:", Object.keys(columnMap))
    
    // Require at least 3 key columns to be found (site, description, totalCost or similar)
    if (matchedColumns >= 3) {
      console.log("[v0] Found header row at index", rowIndex, "with columns:", columnMap)
      return { headerRowIndex: rowIndex, columnMap }
    }
  }
  
  console.log("[v0] Could not find header row with at least 3 matching columns")
  return null
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
 * Parse vendor proposal Excel file from the "Sponsor" tab
 * Maps Excel columns to AssessmentLineItem fields based on the mapping:
 * - Excel "Site" → site
 * - Excel "Description of costs" → description (Additional Information)
 * - Excel "Number of Units" → numberOfUnits
 * - Excel "Unit Price" → unitPrice
 * - Excel "Total Cost" → totalCost
 * - Excel "Currency" → currency
 */
export function parseVendorProposal(buffer: ArrayBuffer, assessmentId: string = ""): ParsedVendorProposal {
  console.log("[v0] parseVendorProposal: Starting to parse Excel file")
  const workbook = XLSX.read(buffer, { type: "array" })
  
  console.log("[v0] Available sheets in workbook:", workbook.SheetNames)
  
  // Find the "Sponsor" sheet (case-insensitive)
  let sponsorSheet: XLSX.WorkSheet | null = null
  let sponsorSheetName = ""
  
  for (const sheetName of workbook.SheetNames) {
    if (sheetName.toLowerCase().includes("sponsor")) {
      sponsorSheet = workbook.Sheets[sheetName]
      sponsorSheetName = sheetName
      console.log("[v0] Found Sponsor sheet:", sheetName)
      break
    }
  }
  
  // If no Sponsor sheet found, use the first sheet
  if (!sponsorSheet) {
    sponsorSheetName = workbook.SheetNames[0]
    sponsorSheet = workbook.Sheets[sponsorSheetName]
    console.log("[v0] No Sponsor sheet found, using first sheet:", sponsorSheetName)
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
    console.warn("[v0] Could not find valid header row in Sponsor sheet")
    return {
      lineItems: [],
      metadata: {
        sheetName: sponsorSheetName,
        rowCount: 0,
        parsedAt: new Date().toISOString()
      }
    }
  }
  
  const { headerRowIndex, columnMap } = headerInfo
  const lineItems: AssessmentLineItem[] = []
  
  // Parse data rows (skip header row)
  for (let rowIndex = headerRowIndex + 1; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]
    if (!row || row.length === 0) continue
    
    // Skip empty rows - check if at least one key field has data
    const hasData = (columnMap.description !== undefined && row[columnMap.description]) ||
                    (columnMap.totalCost !== undefined && row[columnMap.totalCost]) ||
                    (columnMap.site !== undefined && row[columnMap.site])
    
    if (!hasData) continue
    
    // Skip subtotal/total rows
    const firstCell = String(row[0] || "").toLowerCase()
    if (firstCell.includes("total") || firstCell.includes("subtotal") || firstCell.includes("sub-total")) {
      continue
    }
    
    const lineItem: AssessmentLineItem = {
      id: generateId(),
      assessmentId,
      site: columnMap.site !== undefined ? String(row[columnMap.site] || "").trim() : "",
      costCategory: columnMap.costCategory !== undefined ? String(row[columnMap.costCategory] || "").trim() : "",
      description: columnMap.description !== undefined ? String(row[columnMap.description] || "").trim() : "",
      unitType: columnMap.unitType !== undefined ? String(row[columnMap.unitType] || "").trim() : "",
      numberOfUnits: columnMap.numberOfUnits !== undefined ? parseNumber(row[columnMap.numberOfUnits]) : 0,
      unitPrice: columnMap.unitPrice !== undefined ? parseNumber(row[columnMap.unitPrice]) : 0,
      totalCost: columnMap.totalCost !== undefined ? parseNumber(row[columnMap.totalCost]) : 0,
      currency: columnMap.currency !== undefined ? String(row[columnMap.currency] || "USD").trim() : "USD",
      takedaSupported: columnMap.takedaSupported !== undefined ? String(row[columnMap.takedaSupported] || "").trim() : undefined,
      costType: columnMap.costType !== undefined ? String(row[columnMap.costType] || "").trim() : undefined,
      acceptedUnitPrice: columnMap.acceptedUnitPrice !== undefined ? parseNumber(row[columnMap.acceptedUnitPrice]) : undefined,
      acceptedTotalCost: columnMap.acceptedTotalCost !== undefined ? parseNumber(row[columnMap.acceptedTotalCost]) : undefined,
      decision: null,
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
    
    // Parse decision if present
    if (columnMap.decision !== undefined && row[columnMap.decision]) {
      const decisionValue = String(row[columnMap.decision]).trim().toLowerCase()
      if (decisionValue.includes("accept")) lineItem.decision = "Accepted"
      else if (decisionValue.includes("reject")) lineItem.decision = "Rejected"
      else if (decisionValue.includes("pending")) lineItem.decision = "Pending"
      else if (decisionValue.includes("review")) lineItem.decision = "Needs Review"
    }
    
    lineItems.push(lineItem)
  }
  
  return {
    lineItems,
    metadata: {
      sheetName: sponsorSheetName,
      rowCount: lineItems.length,
      parsedAt: new Date().toISOString()
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

// Check if row is a data row (has a code in first column)
function isDataRow(row: (string | number | undefined)[]): boolean {
  const firstCell = String(row[0] || "").trim()
  // Data rows have a non-empty code that's not a section header
  if (!firstCell || firstCell === "") return false
  if (firstCell.toLowerCase().includes("sub total")) return false
  if (firstCell.toLowerCase().includes("procedures")) return false
  if (firstCell.toLowerCase().includes("site costs")) return false
  if (firstCell.toLowerCase().includes("country costs")) return false
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
