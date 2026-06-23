// Canonical list of cost category options.
//
// This is the single source of truth for the cost category dropdown. It is used
// by the assessment comparison table and must also be used by the budget
// template form so users can only ever select from these exact values.
export const COST_CATEGORIES = [
  "Personnel",
  "Start-up",
  "Close-out",
  "IRB/EC fee",
  "Archive",
  "Third-party/vendor (Please provide quotation, offer, official price list)",
  "Other",
  "Overhead %",
] as const

export type CostCategory = (typeof COST_CATEGORIES)[number]
