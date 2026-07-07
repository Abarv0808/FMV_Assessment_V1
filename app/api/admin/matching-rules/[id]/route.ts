import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

const TABLE_BY_KIND: Record<string, string> = {
  synonym: "fmv_synonym_rules",
  ta: "fmv_therapeutic_areas",
  disambiguation: "fmv_disambiguation_rules",
}

function toArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean)
  return []
}

function tableFrom(request: Request): string | null {
  const kind = new URL(request.url).searchParams.get("kind") || ""
  return TABLE_BY_KIND[kind] || null
}

// PATCH -> update a rule. Body: partial fields (only provided keys are updated).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const table = tableFrom(request)
    if (!table) return NextResponse.json({ error: "Invalid or missing 'kind' query param" }, { status: 400 })

    const body = await request.json()
    const patch: Record<string, any> = {}

    if ("label" in body) patch.label = String(body.label || "").trim()
    if ("name" in body) patch.name = String(body.name || "").trim()
    if ("triggers" in body) patch.triggers = toArray(body.triggers)
    if ("aliases" in body) patch.aliases = toArray(body.aliases)
    if ("target_codes" in body) patch.target_codes = toArray(body.target_codes)
    if ("target_keywords" in body) patch.target_keywords = toArray(body.target_keywords)
    if ("default_codes" in body) patch.default_codes = toArray(body.default_codes)
    if ("overrides" in body) patch.overrides = Array.isArray(body.overrides) ? body.overrides : []
    if ("match_mode" in body) patch.match_mode = body.match_mode === "substring" ? "substring" : "word"
    if ("is_mandatory" in body) patch.is_mandatory = !!body.is_mandatory
    if ("enabled" in body) patch.enabled = !!body.enabled
    if ("priority" in body && Number.isFinite(body.priority)) patch.priority = body.priority
    if ("notes" in body) patch.notes = body.notes?.trim() || null

    // All three tables carry an updated_at column.
    patch.updated_at = new Date().toISOString()

    const supabase = createAdminClient()
    const { data, error } = await supabase.from(table).update(patch).eq("id", id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rule: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update rule" }, { status: 500 })
  }
}

// DELETE -> remove a rule.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const table = tableFrom(request)
    if (!table) return NextResponse.json({ error: "Invalid or missing 'kind' query param" }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await supabase.from(table).delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to delete rule" }, { status: 500 })
  }
}
