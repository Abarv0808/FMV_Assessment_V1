export const SECURITY_GROUPS = [
  "USBU",
  "EMEA",
  "APAC",
  "LATAM",
  "GLOBAL",
] as const

export type SecurityGroup = (typeof SECURITY_GROUPS)[number]

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
