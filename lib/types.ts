export const SECURITY_GROUPS = [
  "GME",
  "PDT",
  "VBU",
  "OBU",
  "USBU",
  "R&D",
] as const

export type SecurityGroup = (typeof SECURITY_GROUPS)[number]

export const THERAPEUTIC_AREAS = [
  "Cardiovascular",
  "Dermatology",
  "Gastroenterology",
  "Immunology",
  "Infectious Diseases",
  "Neuroscience",
  "Oncology",
  "Ophthalmology",
  "Rare Diseases",
  "Respiratory",
  "Other",
] as const

export type TherapeuticArea = (typeof THERAPEUTIC_AREAS)[number]

export const USER_ROLES = ["VIEWER", "ANALYST", "APPROVER", "ADMIN"] as const

export type UserRole = (typeof USER_ROLES)[number]

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  securityGroups: SecurityGroup[]
}

export interface Assessment {
  id: string
  name: string
  status: "draft" | "in_review" | "approved" | "rejected"
  createdAt: string
  updatedAt: string
  securityGroup: SecurityGroup
  assignedTo?: string
}

export interface Benchmark {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

// Assessment Line Item - parsed from budget Excel "FMV Template" tab
export interface AssessmentLineItem {
  id: string
  assessmentId: string
  country: string
  costCategory: string
  description: string // "Additional Information" from "Description of costs"
  unitType: string
  numberOfUnits: number
  unitPrice: number
  negotiatedPrice?: number | null
  totalCost: number
  currency: string
  // FMV lead fields
  costType?: string
  acceptedUnitPrice?: number
  acceptedTotalCost?: number
  decision?: "To Assess" | "In-review" | "Accepted" | "Rejected" | "Pending" | "Needs Review" | "Not amended" | "Not accepted" | "Manual assessment" | "Manually Accepted" | "Not Applicable" | "Escalate" | null
  // Benchmark comparison fields
  benchmarkLow?: number
  benchmarkMed?: number
  benchmarkHigh?: number
  benchmark90th?: number
  variance?: number
  flag?: "green" | "yellow" | "red" | null
  benchmarkDescription?: string
  // Q&A fields
  takedaQuestions?: string[]
  investigatorResponses?: string[]
  // Takeda supported
  takedaSupported?: string
}

// Benchmark data source types
export type BenchmarkSource = "IQVIA_GRANTPLAN" | "IQVIA_GPI_GRANTSMANAGER"

export type TrialPhase = "All Phases" | "Phase I" | "Phase II" | "Phase III" | "Phase IV"

export interface BenchmarkFile {
  id: string
  fileName: string
  source: BenchmarkSource
  country: string
  indication: string
  indicationCode?: string
  trialPhase: TrialPhase
  procedureCount: number
  currency: string
  uploadedAt: string
  uploadedBy: string
}

// Benchmark type selection
export type BenchmarkType = "p90" | "high" | "med" | "low"

// Item decision type
export type ItemDecision = "To Assess" | "In-review" | "Accepted" | "Pending" | "Not amended" | "Not accepted" | "Manual assessment" | "Manually Accepted" | "Not Applicable" | "Escalate"

// Decisions that take a line item out of FMV benchmarking entirely.
// These items are never sent to the comparison engine, and any benchmark
// results captured on an earlier run (e.g. while the item was still
// "To Assess") must stay hidden for as long as the decision is set to one
// of these values. Kept as a single source of truth so the UI, the export
// and the comparison pipeline can never drift apart.
export const NON_ASSESSABLE_DECISIONS = ["manual assessment", "manually accepted", "not applicable"] as const

export function isNonAssessableDecision(decision?: string | null): boolean {
  if (!decision) return false
  return (NON_ASSESSABLE_DECISIONS as readonly string[]).includes(decision.toLowerCase().trim())
}

// Extended line item with additional comparison fields
export interface LineItemWithComparison extends AssessmentLineItem {
  numberOfUnit?: number
  additionalInformation?: string
  noteLogic?: string
  questionComment?: string
  // Free-text comment entered by the reviewer for this line item.
  comment?: string
  source?: string
}

// Possible match from AI comparison
export interface PossibleMatch {
  benchmarkId: string
  procedureName: string
  code?: string
  category: string
  similarity: number
  reasoning?: string
  p25?: number
  p50?: number
  p75?: number
  p90?: number
  p100?: number
}

// Assessment comparison - linking line item to benchmark data
export interface AssessmentComparison {
  id: string
  lineItem: LineItemWithComparison
  benchmarkLow?: number
  benchmarkMed?: number
  benchmarkHigh?: number
  benchmark90th?: number
  benchmarkHighPercentile?: number
  selectedBenchmarkType: BenchmarkType
  variance: number
  variancePercent: number
  flag: "GREEN" | "YELLOW" | "RED" | "NO_MATCH" | "MULTIPLE_MATCHES"
  aiSuggestion?: string
  benchmarkDescription?: string
  possibleMatches?: PossibleMatch[]
  userSelected?: string
}
