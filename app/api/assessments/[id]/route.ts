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
