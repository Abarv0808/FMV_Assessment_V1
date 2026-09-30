import { NextResponse } from "next/server"
import { query } from "@/lib/db"

const ALLOWED_SOURCES = new Set(["IQVIA_GRANTPLAN", "IQVIA_GPI_GRANTSMANAGER"])

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const source = searchParams.get("source")

    if (source && !ALLOWED_SOURCES.has(source)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 })
    }

    const { rows } = source
      ? await query(
          `SELECT * FROM benchmark_files WHERE source::text = $1 ORDER BY indication ASC`,
          [source],
        )
      : await query(`SELECT * FROM benchmark_files ORDER BY uploaded_at DESC`)

    return NextResponse.json(
      { files: rows },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  } catch (error: any) {
    console.error("[v0] Benchmark files API error:", error.message)
    return NextResponse.json({ files: [], error: error.message }, { status: 500 })
  }
}
