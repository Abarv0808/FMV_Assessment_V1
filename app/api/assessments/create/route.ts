import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      name,
      studyTrackingNumber,
      protocolNumber,
      therapeuticArea,
      businessUnit,
      description,
      country,
      benchmarkFileIds,
      benchmarkSource,
    } = body

    const supabase = createAdminClient()

    const { data: assessment, error } = await supabase
      .from("assessments")
      .insert({
        name,
        study_tracking_number: studyTrackingNumber || null,
        protocol_number: protocolNumber || null,
        therapeutic_area: therapeuticArea || null,
        business_unit: businessUnit || null,
        description: description || null,
        country: country || null,
        benchmark_source: benchmarkSource || "IQVIA_GRANTPLAN",
        status: "in_review",
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating assessment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Link benchmark files to assessment
    if (benchmarkFileIds && benchmarkFileIds.length > 0) {
      const benchmarkLinks = benchmarkFileIds.map((fileId: string) => ({
        assessment_id: assessment.id,
        benchmark_file_id: fileId
      }))

      const { error: linkError } = await supabase
        .from("assessment_benchmark_files")
        .insert(benchmarkLinks)

      if (linkError) {
        console.error("[v0] Error linking benchmark files:", linkError)
      }
    }

    return NextResponse.json({ assessment })
  } catch (err: any) {
    console.error("[v0] Exception creating assessment:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
