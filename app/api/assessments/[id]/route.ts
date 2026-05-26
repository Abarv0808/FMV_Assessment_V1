import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data: assessment, error } = await supabase
      .from("assessments")
      .select("*")
      .eq("id", id)
      .single()

    if (error) {
      console.log("[v0] Error fetching assessment:", error.message)
      return NextResponse.json({ assessment: null, error: error.message }, { status: 200 })
    }

    return NextResponse.json({ assessment })
  } catch (err: any) {
    console.error("[v0] Exception fetching assessment:", err)
    return NextResponse.json({ assessment: null, error: err.message }, { status: 200 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const supabase = createAdminClient()

    const { data: assessment, error } = await supabase
      .from("assessments")
      .update(body)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating assessment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ assessment })
  } catch (err: any) {
    console.error("[v0] Exception updating assessment:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * Delete an assessment and any of its dependent rows. Used by the create-flow
 * rollback when line-item parsing/storage fails after the assessment row was
 * already inserted, so we don't leave blank assessments orphaned in the DB.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    // Best-effort: clean up child tables first. Errors here are logged but do
    // not block deletion of the assessment row itself (FK on cascade may
    // already handle it depending on schema).
    const childTables = ["assessment_line_items", "assessment_comparisons", "assessment_audit_log"]
    for (const table of childTables) {
      const { error: childErr } = await supabase.from(table).delete().eq("assessment_id", id)
      if (childErr && childErr.code !== "42P01" /* table missing */) {
        console.log(`[v0] Non-fatal: could not delete from ${table} for assessment ${id}:`, childErr.message)
      }
    }

    const { error } = await supabase.from("assessments").delete().eq("id", id)
    if (error) {
      console.error("[v0] Error deleting assessment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[v0] Exception deleting assessment:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
