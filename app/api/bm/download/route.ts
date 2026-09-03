import { createClient } from "@/lib/supabase/server"
import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { TRIAL_PHASE_III_B } from "@/lib/types"

// These are the phases exposed throughout the benchmark UI.
const ALLOWED_PHASES = ["All Phases", "Phase IV", TRIAL_PHASE_III_B]

// Fetch every row for a query, paginating past Supabase's 1000-row cap.
async function fetchAll<T>(
  runQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const all: T[] = []
  while (true) {
    const { data, error } = await runQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const indication = searchParams.get("indication")
    const phase = searchParams.get("phase") // optional; when absent, download all phases for the indication

    if (!indication) {
      return NextResponse.json({ success: false, error: "Missing 'indication' parameter" }, { status: 400 })
    }
    const allowedPhases = ALLOWED_PHASES
    if (phase && !allowedPhases.includes(phase)) {
      return NextResponse.json({ success: false, error: `Unsupported phase: ${phase}` }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Find the matching benchmark files (metadata) for this indication/phase.
    const files = await fetchAll<Record<string, unknown>>((from, to) => {
      let q = supabase
        .from("benchmark_files")
        .select("id, file_name, source, country, indication, trial_phase, currency")
        .eq("indication", indication)
        .in("trial_phase", phase ? [phase] : allowedPhases)
        .order("country", { ascending: true })
        .range(from, to)
      return q
    })

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "No benchmark files found for this selection" }, { status: 404 })
    }

    const fileById = new Map(files.map((f) => [f.id as string, f]))
    const fileIds = files.map((f) => f.id as string)

    // 2. Pull all procedure rows for those files.
    const procedures = await fetchAll<Record<string, unknown>>((from, to) =>
      supabase
        .from("benchmark_procedures")
        .select(
          "benchmark_file_id, procedure_code, procedure_name, category, p25, p50, p75, p90, p100, mean, sample_size, source_ref",
        )
        .in("benchmark_file_id", fileIds)
        .range(from, to),
    )

    // 3. Flatten into rows with country/source/currency context from the parent file.
    const rows = procedures.map((p) => {
      const file = fileById.get(p.benchmark_file_id as string) || {}
      return {
        Country: (file.country as string) || "",
        Indication: (file.indication as string) || "",
        Phase: (file.trial_phase as string) || "",
        Source:
          file.source === "IQVIA_GRANTPLAN" ? "IQVIA GrantPlan" : file.source === "IQVIA_GPI" ? "IQVIA GPI" : (file.source as string) || "",
        Currency: (file.currency as string) || "",
        Category: (p.category as string) || "",
        "Procedure Code": (p.procedure_code as string) || "",
        "Procedure Name": (p.procedure_name as string) || "",
        P25: p.p25 ?? "",
        P50: p.p50 ?? "",
        P75: p.p75 ?? "",
        P90: p.p90 ?? "",
        P100: p.p100 ?? "",
        Mean: p.mean ?? "",
        "Sample Size": p.sample_size ?? "",
        "Source Ref": (p.source_ref as string) || "",
      }
    })

    // Sort by country, then procedure name, for a readable export.
    rows.sort((a, b) => a.Country.localeCompare(b.Country) || a["Procedure Name"].localeCompare(b["Procedure Name"]))

    // 4. Build the workbook.
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    const sheetName = (phase || "All Phases").slice(0, 31)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer

    const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")
    const fileName = `benchmarks_${safe(indication)}_${safe(phase || "All_Phases")}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    })
  } catch (error: any) {
    console.error("[v0] Error generating benchmark download:", error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
