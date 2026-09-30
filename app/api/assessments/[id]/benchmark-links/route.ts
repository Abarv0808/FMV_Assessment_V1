import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { rows } = await query<{ benchmark_file_id: string }>(
      `SELECT benchmark_file_id FROM assessment_benchmark_files WHERE assessment_id = $1`,
      [id],
    )
    return NextResponse.json(
      { benchmarkFileIds: rows.map((r) => r.benchmark_file_id) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  } catch (error: any) {
    console.error("[v0] Benchmark links API error:", error.message)
    return NextResponse.json({ benchmarkFileIds: [], error: error.message }, { status: 500 })
  }
}
