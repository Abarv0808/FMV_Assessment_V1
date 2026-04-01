export const SECURITY_GROUPS = [
  "USBU",
  "EMEA",
  "APAC",
  "LATAM",
  "GLOBAL",
] as const

export type SecurityGroup = (typeof SECURITY_GROUPS)[number]

export const THERAPEUTIC_AREAS = [
  "Oncology",
  "Immunology",
  "Neuroscience",
  "Cardiovascular",
  "Rare Diseases",
  "Infectious Diseases",
  "Respiratory",
  "Dermatology",
  "Ophthalmology",
  "Other",
] as const

export type TherapeuticArea = (typeof THERAPEUTIC_AREAS)[number]

export type UserRole = "VIEWER" | "ANALYST" | "APPROVER" | "ADMIN"

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

// Assessment Line Item - parsed from vendor proposal Excel "Sponsor" tab
export interface AssessmentLineItem {
  id: string
  assessmentId: string
  site: string
  costCategory: string
  description: string // "Additional Information" from "Description of costs"
  unitType: string
  numberOfUnits: number
  unitPrice: number
  totalCost: number
  currency: string
  // FMV lead fields
  costType?: string
  acceptedUnitPrice?: number
  acceptedTotalCost?: number
  decision?: "Accepted" | "Rejected" | "Pending" | "Needs Review" | null
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

export type TrialPhase = "Phase I" | "Phase II" | "Phase III" | "Phase IV"

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
