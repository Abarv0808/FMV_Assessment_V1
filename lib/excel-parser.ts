import * as XLSX from "xlsx"

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
