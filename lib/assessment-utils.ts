import type { Assessment, SecurityGroup } from "./types"

interface AuthUser {
  role: string
  securityGroups: SecurityGroup[]
}

/**
 * Filter assessments based on the logged-in user's role and security groups.
 * - ADMIN role sees all assessments.
 * - Other roles only see assessments whose businessUnit is included in their securityGroups.
 */
export function filterAssessmentsByUser(
  assessments: Assessment[],
  user: AuthUser | null
): Assessment[] {
  if (!user) return []
  if (user.role === "ADMIN") return assessments
  if (!user.securityGroups || user.securityGroups.length === 0) return []
  return assessments.filter((a) => a.businessUnit && user.securityGroups.includes(a.businessUnit))
}
