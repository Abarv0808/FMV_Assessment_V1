import { NextResponse } from "next/server"
import { db } from "@/lib/db"

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

// GET -> all three rule sets.
export async function GET() {
  try {
    const [syn, ta, dis] = await Promise.all([
      db.from("fmv_synonym_rules").select("*").order("priority", { ascending: true }),
      db.from("fmv_therapeutic_areas").select("*").order("name", { ascending: true }),
      db.from("fmv_disambiguation_rules").select("*").order("priority", { ascending: true }),
    ])

    if (syn.error || ta.error || dis.error) {
      const message = syn.error?.message || ta.error?.message || dis.error?.message
      // Most likely the migrations haven't been run yet.
      return NextResponse.json(
        {
          synonymRules: [],
          therapeuticAreas: [],
          disambiguationRules: [],
          warning: `Rule tables unavailable. Run scripts 013 & 014. (${message})`,
        },
        { status: 200 },
      )
    }

    return NextResponse.json({
      synonymRules: syn.data || [],
      therapeuticAreas: ta.data || [],
      disambiguationRules: dis.data || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load rules" }, { status: 500 })
  }
}

// POST -> create a rule. Body: { kind, ...fields }.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const kind = body?.kind as string
    const table = TABLE_BY_KIND[kind]
    if (!table) return NextResponse.json({ error: "Invalid or missing 'kind'" }, { status: 400 })

    let payload: Record<string, any>

    if (kind === "synonym") {
      if (!body.label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 })
      payload = {
        label: body.label.trim(),
        triggers: toArray(body.triggers),
        match_mode: body.match_mode === "substring" ? "substring" : "word",
        target_codes: toArray(body.target_codes),
        target_keywords: toArray(body.target_keywords),
        is_mandatory: !!body.is_mandatory,
        priority: Number.isFinite(body.priority) ? body.priority : 100,
        enabled: body.enabled !== false,
        notes: body.notes?.trim() || null,
      }
    } else if (kind === "ta") {
      if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
      payload = {
        name: body.name.trim(),
        aliases: toArray(body.aliases),
        enabled: body.enabled !== false,
      }
    } else {
      if (!body.label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 })
      payload = {
        label: body.label.trim(),
        triggers: toArray(body.triggers),
        default_codes: toArray(body.default_codes),
        overrides: Array.isArray(body.overrides) ? body.overrides : [],
        priority: Number.isFinite(body.priority) ? body.priority : 100,
        enabled: body.enabled !== false,
        notes: body.notes?.trim() || null,
      }
    }

    const { data, error } = await db.from(table).insert(payload).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rule: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create rule" }, { status: 500 })
  }
}
