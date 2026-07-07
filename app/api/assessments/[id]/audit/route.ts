import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

// Until the 012_create_assessment_audit_log.sql migration is run, we degrade
// gracefully instead of erroring so the rest of the page keeps working.
// PostgREST reports a missing table as "PGRST205" (schema cache miss), while
// raw Postgres uses "42P01"; treat both (and the message) as "table missing".
function isTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (error.message?.includes("assessment_audit_log") ?? false)
  )
}

/**
 * GET /api/assessments/[id]/audit
 * Returns the persisted audit trail (newest first) for an assessment.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("assessment_audit_log")
      .select("*")
      .eq("assessment_id", id)
      .order("created_at", { ascending: false })

    if (error) {
      if (isTableMissing(error)) {
        console.log("[v0] assessment_audit_log table missing; run migration 012.")
        return NextResponse.json({ events: [], tableMissing: true })
      }
      console.error("[v0] Error loading audit log:", error)
      return NextResponse.json({ events: [], error: error.message })
    }

    const events = (data ?? []).map((row: any) => ({
      id: row.id,
      userName: row.user_name || "Unknown User",
      action: row.action,
      timestamp: row.created_at,
    }))

    return NextResponse.json({ events })
  } catch (err: any) {
    console.error("[v0] Exception loading audit log:", err)
    return NextResponse.json({ events: [], error: err.message })
  }
}

/**
 * POST /api/assessments/[id]/audit
 * Appends a single audit event. Body: { action: string, userName?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { action, userName } = await request.json()

    if (!action || typeof action !== "string") {
      return NextResponse.json({ error: "action is required" }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("assessment_audit_log")
      .insert({
        assessment_id: id,
        user_name: userName || "Unknown User",
        action,
      })
      .select()
      .single()

    if (error) {
      if (isTableMissing(error)) {
        console.log("[v0] assessment_audit_log table missing; run migration 012.")
        return NextResponse.json({ event: null, tableMissing: true })
      }
      console.error("[v0] Error appending audit event:", error)
      return NextResponse.json({ event: null, error: error.message })
    }

    return NextResponse.json({
      event: {
        id: data.id,
        userName: data.user_name || "Unknown User",
        action: data.action,
        timestamp: data.created_at,
      },
    })
  } catch (err: any) {
    console.error("[v0] Exception appending audit event:", err)
    return NextResponse.json({ event: null, error: err.message })
  }
}
