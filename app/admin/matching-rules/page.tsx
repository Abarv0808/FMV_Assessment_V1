"use client"

import { useAuth } from "@/lib/auth-context"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { ArrowLeft, BookMarked, Plus, Pencil, Trash2, Loader2, Sparkles, Stethoscope, GitBranch } from "lucide-react"

type Kind = "synonym" | "ta" | "disambiguation"

interface SynonymRule {
  id: string
  label: string
  triggers: string[]
  match_mode: "word" | "substring"
  target_codes: string[]
  target_keywords: string[]
  is_mandatory: boolean
  priority: number
  enabled: boolean
  notes?: string | null
}
interface TherapeuticArea {
  id: string
  name: string
  aliases: string[]
  enabled: boolean
}
interface Override {
  keywords: string[]
  codes: string[]
}
interface DisambiguationRule {
  id: string
  label: string
  triggers: string[]
  default_codes: string[]
  overrides: Override[]
  priority: number
  enabled: boolean
  notes?: string | null
}

const csv = (arr: string[] | undefined) => (arr || []).join(", ")
const toArr = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)

export default function MatchingRulesPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)
  const [synonymRules, setSynonymRules] = useState<SynonymRule[]>([])
  const [therapeuticAreas, setTherapeuticAreas] = useState<TherapeuticArea[]>([])
  const [disambiguationRules, setDisambiguationRules] = useState<DisambiguationRule[]>([])

  // Dialog state
  const [dialogKind, setDialogKind] = useState<Kind | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: Kind; id: string; label: string } | null>(null)

  // Shared form fields (superset for all kinds)
  const [fLabel, setFLabel] = useState("")
  const [fName, setFName] = useState("")
  const [fTriggers, setFTriggers] = useState("")
  const [fAliases, setFAliases] = useState("")
  const [fTargetCodes, setFTargetCodes] = useState("")
  const [fTargetKeywords, setFTargetKeywords] = useState("")
  const [fDefaultCodes, setFDefaultCodes] = useState("")
  const [fOverrides, setFOverrides] = useState<Override[]>([])
  const [fMatchMode, setFMatchMode] = useState<"word" | "substring">("word")
  const [fMandatory, setFMandatory] = useState(false)
  const [fEnabled, setFEnabled] = useState(true)
  const [fPriority, setFPriority] = useState(100)
  const [fNotes, setFNotes] = useState("")

  useEffect(() => {
    if (!isLoading && user?.role !== "ADMIN") {
      router.push("/dashboard")
    }
  }, [user, isLoading, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/matching-rules")
      const data = await res.json()
      setSynonymRules(data.synonymRules || [])
      setTherapeuticAreas(data.therapeuticAreas || [])
      setDisambiguationRules(data.disambiguationRules || [])
      setWarning(data.warning || null)
    } catch (e: any) {
      setWarning(e?.message || "Failed to load rules")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === "ADMIN") load()
  }, [user, load])

  const resetForm = useCallback(() => {
    setFLabel(""); setFName(""); setFTriggers(""); setFAliases("")
    setFTargetCodes(""); setFTargetKeywords(""); setFDefaultCodes("")
    setFOverrides([]); setFMatchMode("word"); setFMandatory(false)
    setFEnabled(true); setFPriority(100); setFNotes("")
    setEditingId(null)
  }, [])

  const openCreate = (kind: Kind) => { resetForm(); setDialogKind(kind) }

  const openEditSynonym = (r: SynonymRule) => {
    resetForm()
    setEditingId(r.id); setFLabel(r.label); setFTriggers(csv(r.triggers))
    setFTargetCodes(csv(r.target_codes)); setFTargetKeywords(csv(r.target_keywords))
    setFMatchMode(r.match_mode); setFMandatory(r.is_mandatory); setFEnabled(r.enabled)
    setFPriority(r.priority); setFNotes(r.notes || "")
    setDialogKind("synonym")
  }
  const openEditTA = (r: TherapeuticArea) => {
    resetForm()
    setEditingId(r.id); setFName(r.name); setFAliases(csv(r.aliases)); setFEnabled(r.enabled)
    setDialogKind("ta")
  }
  const openEditDisambiguation = (r: DisambiguationRule) => {
    resetForm()
    setEditingId(r.id); setFLabel(r.label); setFTriggers(csv(r.triggers))
    setFDefaultCodes(csv(r.default_codes)); setFOverrides(r.overrides || [])
    setFEnabled(r.enabled); setFPriority(r.priority); setFNotes(r.notes || "")
    setDialogKind("disambiguation")
  }

  const buildPayload = (kind: Kind) => {
    if (kind === "synonym") {
      return {
        kind, label: fLabel, triggers: toArr(fTriggers), match_mode: fMatchMode,
        target_codes: toArr(fTargetCodes), target_keywords: toArr(fTargetKeywords),
        is_mandatory: fMandatory, enabled: fEnabled, priority: fPriority, notes: fNotes,
      }
    }
    if (kind === "ta") {
      return { kind, name: fName, aliases: toArr(fAliases), enabled: fEnabled }
    }
    return {
      kind, label: fLabel, triggers: toArr(fTriggers), default_codes: toArr(fDefaultCodes),
      overrides: fOverrides.filter((o) => o.keywords.length && o.codes.length),
      enabled: fEnabled, priority: fPriority, notes: fNotes,
    }
  }

  const handleSave = async () => {
    if (!dialogKind) return
    const kind = dialogKind
    // Basic validation
    if (kind === "ta" ? !fName.trim() : !fLabel.trim()) return
    setSaving(true)
    try {
      const payload = buildPayload(kind)
      if (editingId) {
        await fetch(`/api/admin/matching-rules/${editingId}?kind=${kind}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch("/api/admin/matching-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
      setDialogKind(null)
      resetForm()
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await fetch(`/api/admin/matching-rules/${deleteTarget.id}?kind=${deleteTarget.kind}`, { method: "DELETE" })
    setDeleteTarget(null)
    await load()
  }

  const toggleEnabled = async (kind: Kind, id: string, enabled: boolean) => {
    await fetch(`/api/admin/matching-rules/${id}?kind=${kind}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
    await load()
  }

  if (isLoading || user?.role !== "ADMIN") return null

  return (
    <AppShell>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin")} aria-label="Back to Admin Console">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <BookMarked className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">Matching Rules</h1>
            <p className="text-muted-foreground mt-1">
              Domain knowledge that guides how vendor line items map to benchmark procedures
            </p>
          </div>
        </div>

        {warning && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            {warning}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading rules...
          </div>
        ) : (
          <Tabs defaultValue="synonym" className="space-y-4">
            <TabsList>
              <TabsTrigger value="synonym" className="gap-2"><Sparkles className="h-4 w-4" /> Role &amp; Synonym</TabsTrigger>
              <TabsTrigger value="ta" className="gap-2"><Stethoscope className="h-4 w-4" /> Therapeutic Areas</TabsTrigger>
              <TabsTrigger value="disambiguation" className="gap-2"><GitBranch className="h-4 w-4" /> Disambiguation</TabsTrigger>
            </TabsList>

            {/* -------- Synonym rules -------- */}
            <TabsContent value="synonym">
              <Card className="border-border/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Role &amp; Synonym Rules</CardTitle>
                      <CardDescription className="mt-1.5">
                        Map vendor terms/roles to benchmark targets (e.g. CRA → Monitoring, PhD student → Data Entry).
                      </CardDescription>
                    </div>
                    <Button onClick={() => openCreate("synonym")}>
                      <Plus className="h-4 w-4 mr-2" /> Add Rule
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-border/40">
                          <TableHead>Rule</TableHead>
                          <TableHead>Triggers</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead className="text-center">Mandatory</TableHead>
                          <TableHead className="text-center">Enabled</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {synonymRules.map((r) => (
                          <TableRow key={r.id} className="border-border/40">
                            <TableCell className="font-medium">{r.label}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[220px]">
                              <span className="line-clamp-2">{csv(r.triggers)}</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {r.target_codes.length > 0 ? (
                                <span className="flex flex-wrap gap-1">
                                  {r.target_codes.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">{csv(r.target_keywords)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {r.is_mandatory ? <Badge>Always</Badge> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch checked={r.enabled} onCheckedChange={(v) => toggleEnabled("synonym", r.id, v)} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditSynonym(r)} aria-label="Edit">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ kind: "synonym", id: r.id, label: r.label })} aria-label="Delete">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {synonymRules.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No synonym rules yet.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* -------- Therapeutic areas -------- */}
            <TabsContent value="ta">
              <Card className="border-border/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Therapeutic Areas</CardTitle>
                      <CardDescription className="mt-1.5">
                        When a line item mentions a physician/specialist plus one of these areas, the TA-specific physician benchmark is preferred.
                      </CardDescription>
                    </div>
                    <Button onClick={() => openCreate("ta")}>
                      <Plus className="h-4 w-4 mr-2" /> Add Area
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-border/40">
                          <TableHead>Area</TableHead>
                          <TableHead>Aliases</TableHead>
                          <TableHead className="text-center">Enabled</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {therapeuticAreas.map((r) => (
                          <TableRow key={r.id} className="border-border/40">
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{csv(r.aliases)}</TableCell>
                            <TableCell className="text-center">
                              <Switch checked={r.enabled} onCheckedChange={(v) => toggleEnabled("ta", r.id, v)} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditTA(r)} aria-label="Edit">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ kind: "ta", id: r.id, label: r.name })} aria-label="Delete">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {therapeuticAreas.length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No therapeutic areas yet.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* -------- Disambiguation rules -------- */}
            <TabsContent value="disambiguation">
              <Card className="border-border/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Disambiguation Rules</CardTitle>
                      <CardDescription className="mt-1.5">
                        Pick a default benchmark for a family, overridden by keywords (e.g. IRB/EC → initial fee unless amendment/renewal/close-out).
                      </CardDescription>
                    </div>
                    <Button onClick={() => openCreate("disambiguation")}>
                      <Plus className="h-4 w-4 mr-2" /> Add Rule
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-border/40">
                          <TableHead>Rule</TableHead>
                          <TableHead>Triggers</TableHead>
                          <TableHead>Default</TableHead>
                          <TableHead className="text-center">Overrides</TableHead>
                          <TableHead className="text-center">Enabled</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {disambiguationRules.map((r) => (
                          <TableRow key={r.id} className="border-border/40">
                            <TableCell className="font-medium">{r.label}</TableCell>
                            <TableCell className="text-muted-foreground text-sm max-w-[220px]">
                              <span className="line-clamp-2">{csv(r.triggers)}</span>
                            </TableCell>
                            <TableCell>
                              <span className="flex flex-wrap gap-1">
                                {r.default_codes.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">{(r.overrides || []).length}</TableCell>
                            <TableCell className="text-center">
                              <Switch checked={r.enabled} onCheckedChange={(v) => toggleEnabled("disambiguation", r.id, v)} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditDisambiguation(r)} aria-label="Edit">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ kind: "disambiguation", id: r.id, label: r.label })} aria-label="Delete">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {disambiguationRules.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No disambiguation rules yet.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* ---------- Create/Edit dialog ---------- */}
      <Dialog open={dialogKind !== null} onOpenChange={(open) => { if (!open) { setDialogKind(null); resetForm() } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit" : "Add"}{" "}
              {dialogKind === "synonym" ? "Synonym Rule" : dialogKind === "ta" ? "Therapeutic Area" : "Disambiguation Rule"}
            </DialogTitle>
            <DialogDescription>Comma-separate list values. Changes apply on the next comparison run.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {dialogKind === "ta" ? (
              <>
                <Field label="Name *">
                  <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Hematology" />
                </Field>
                <Field label="Aliases" hint="Alternative spellings/abbreviations">
                  <Input value={fAliases} onChange={(e) => setFAliases(e.target.value)} placeholder="haematology, heme" />
                </Field>
                <ToggleRow label="Enabled" checked={fEnabled} onChange={setFEnabled} />
              </>
            ) : (
              <>
                <Field label="Label *">
                  <Input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="CRA → Monitoring (per hour)" />
                </Field>
                <Field label="Triggers *" hint="Vendor keywords/phrases that activate this rule">
                  <Input value={fTriggers} onChange={(e) => setFTriggers(e.target.value)} placeholder="cra, clinical research associate" />
                </Field>

                {dialogKind === "synonym" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Target codes" hint="Preferred (e.g. SC155)">
                        <Input value={fTargetCodes} onChange={(e) => setFTargetCodes(e.target.value)} placeholder="SC155" />
                      </Field>
                      <Field label="Target keywords" hint="Fallback by name">
                        <Input value={fTargetKeywords} onChange={(e) => setFTargetKeywords(e.target.value)} placeholder="monitoring" />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Match mode">
                        <Select value={fMatchMode} onValueChange={(v) => setFMatchMode(v as "word" | "substring")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="word">Whole word</SelectItem>
                            <SelectItem value="substring">Substring</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Priority" hint="Lower runs first">
                        <Input type="number" value={fPriority} onChange={(e) => setFPriority(Number(e.target.value) || 100)} />
                      </Field>
                    </div>
                    <ToggleRow label="Mandatory (always link)" checked={fMandatory} onChange={setFMandatory} />
                    <ToggleRow label="Enabled" checked={fEnabled} onChange={setFEnabled} />
                  </>
                ) : (
                  <>
                    <Field label="Default codes *" hint="Used when no override keyword matches">
                      <Input value={fDefaultCodes} onChange={(e) => setFDefaultCodes(e.target.value)} placeholder="SC005" />
                    </Field>
                    <div className="space-y-2">
                      <Label>Overrides</Label>
                      <p className="text-xs text-muted-foreground">First override whose keywords appear in the description wins.</p>
                      <div className="space-y-2">
                        {fOverrides.map((ov, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Input
                              className="flex-1"
                              placeholder="keywords (comma-sep)"
                              value={csv(ov.keywords)}
                              onChange={(e) => setFOverrides((prev) => prev.map((o, idx) => idx === i ? { ...o, keywords: toArr(e.target.value) } : o))}
                            />
                            <Input
                              className="w-28"
                              placeholder="codes"
                              value={csv(ov.codes)}
                              onChange={(e) => setFOverrides((prev) => prev.map((o, idx) => idx === i ? { ...o, codes: toArr(e.target.value) } : o))}
                            />
                            <Button variant="ghost" size="icon" onClick={() => setFOverrides((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove override">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => setFOverrides((prev) => [...prev, { keywords: [], codes: [] }])}>
                          <Plus className="h-4 w-4 mr-2" /> Add override
                        </Button>
                      </div>
                    </div>
                    <Field label="Priority" hint="Lower runs first">
                      <Input type="number" value={fPriority} onChange={(e) => setFPriority(Number(e.target.value) || 100)} />
                    </Field>
                    <ToggleRow label="Enabled" checked={fEnabled} onChange={setFEnabled} />
                  </>
                )}

                <Field label="Notes">
                  <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} placeholder="Optional explanation for the FMV team" />
                </Field>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogKind(null); resetForm() }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Delete confirm ---------- */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.label}&quot; will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
      <Label className="cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
