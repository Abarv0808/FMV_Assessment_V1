import { NextResponse } from "next/server"
import { db, query } from "@/lib/db"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: assessment, error } = await db
      .from("assessments")
      .select("*")
      .eq("id", id)
      .single()

    if (error) {
      console.log("[v0] Error fetching assessment:", error.message)
      return NextResponse.json({ assessment: null, error: error.message }, { status: 200 })
    }

    // Fetch the linked benchmark files so the UI can render the data-source
    // hierarchy (Source -> Indication -> Phase -> Country). These live in
    // benchmark_files, joined through the assessment_benchmark_files junction.
    let benchmarkFiles: any[] = []
    try {
      const { rows } = await query(
        `SELECT bf.id, bf.source, bf.indication, bf.trial_phase, bf.country
           FROM assessment_benchmark_files abf
           JOIN benchmark_files bf ON bf.id = abf.benchmark_file_id
          WHERE abf.assessment_id = $1`,
        [id],
      )
      benchmarkFiles = rows
    } catch (linkedError: any) {
      console.log("[v0] Non-fatal: could not fetch linked benchmark files:", linkedError.message)
    }

    return NextResponse.json({ assessment: { ...assessment, benchmark_files: benchmarkFiles } })
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

    const { data: assessment, error } = await db
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

    // Best-effort: clean up child tables first. Errors here are logged but do
    // not block deletion of the assessment row itself (FK on cascade may
    // already handle it depending on schema).
    const childTables = ["assessment_line_items", "assessment_comparisons", "assessment_audit_log"]
    for (const table of childTables) {
      const { error: childErr } = await db.from(table).delete().eq("assessment_id", id)
      if (childErr && childErr.code !== "42P01" /* table missing */) {
        console.log(`[v0] Non-fatal: could not delete from ${table} for assessment ${id}:`, childErr.message)
      }
    }

    const { error } = await db.from("assessments").delete().eq("id", id)
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
