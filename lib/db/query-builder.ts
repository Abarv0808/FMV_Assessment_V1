/**
 * Minimal parameterised query builder covering the subset of operations SmartFMV uses.
 * Identifiers are validated and quoted; every value is sent as a $n parameter.
 * Results use a `{ data, error }` shape so existing route logic keeps working unchanged.
 */

export type DbError = { message: string; code?: string; details?: string }
export type DbResult<T = any> = { data: T | null; error: DbError | null }

export type QueryExecutor = (text: string, params: unknown[]) => Promise<{ rows: any[] }>

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

// JSONB columns must be sent as JSON text. TEXT[] columns (matching rules) must stay JS arrays.
const JSON_COLUMNS = new Set(["raw_data", "possible_matches", "ai_matches", "overrides", "details", "metadata"])

export function quoteIdent(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Invalid SQL identifier: ${name}`)
  return `"${name}"`
}

function parseColumns(columns: string): string {
  const parts = columns.split(",").map((c) => c.trim()).filter(Boolean)
  if (parts.length === 0) return "*"
  return parts
    .map((c) => {
      if (c === "*") return "*"
      if (c.includes("(")) {
        throw new Error(`Embedded relation selects are not supported; use an explicit SQL join: ${c}`)
      }
      return quoteIdent(c)
    })
    .join(", ")
}

function encodeValue(column: string, value: unknown): unknown {
  if (value === undefined) return null
  if (value === null) return null
  if (value instanceof Date) return value
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value)
  if (Array.isArray(value)) {
    return value.some((v) => v !== null && typeof v === "object") ? JSON.stringify(value) : value
  }
  if (typeof value === "object") return JSON.stringify(value)
  return value
}

type Filter = { column: string; op: "=" | "<>" | "in" | "is" | ">" | ">=" | "<" | "<="; value: unknown }
type Mode = "select" | "insert" | "update" | "delete"

export class QueryBuilder<T = any> implements PromiseLike<DbResult<T>> {
  private mode: Mode = "select"
  private columns = "*"
  private returning: string | null = null
  private filters: Filter[] = []
  private orders: { column: string; ascending: boolean; nullsFirst?: boolean }[] = []
  private limitCount: number | null = null
  private offsetCount: number | null = null
  private rows: Record<string, unknown>[] = []
  private patch: Record<string, unknown> = {}
  private singleMode: "single" | "maybeSingle" | null = null

  constructor(
    private readonly table: string,
    private readonly execute: QueryExecutor,
  ) {
    quoteIdent(table)
  }

  select(columns = "*"): this {
    if (this.mode === "select") this.columns = columns
    else this.returning = columns
    return this
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mode = "insert"
    this.rows = Array.isArray(values) ? values : [values]
    return this
  }

  update(values: Record<string, unknown>): this {
    this.mode = "update"
    this.patch = values
    return this
  }

  delete(): this {
    this.mode = "delete"
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: value === null ? "is" : "=", value })
    return this
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: "<>", value })
    return this
  }

  in(column: string, values: readonly unknown[]): this {
    this.filters.push({ column, op: "in", value: [...values] })
    return this
  }

  is(column: string, value: null): this {
    this.filters.push({ column, op: "is", value })
    return this
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: ">", value })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: ">=", value })
    return this
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: "<", value })
    return this
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: "<=", value })
    return this
  }

  match(criteria: Record<string, unknown>): this {
    for (const [column, value] of Object.entries(criteria)) this.eq(column, value)
    return this
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}): this {
    this.orders.push({ column, ascending: options.ascending ?? true, nullsFirst: options.nullsFirst })
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  range(from: number, to: number): this {
    this.offsetCount = from
    this.limitCount = to - from + 1
    return this
  }

  single(): PromiseLike<DbResult<T>> {
    this.singleMode = "single"
    return this
  }

  maybeSingle(): PromiseLike<DbResult<T>> {
    this.singleMode = "maybeSingle"
    return this
  }

  toSQL(): { text: string; params: unknown[] } {
    const params: unknown[] = []
    const bind = (value: unknown) => {
      params.push(value)
      return `$${params.length}`
    }
    const table = quoteIdent(this.table)

    const where = () => {
      if (this.filters.length === 0) return ""
      const clauses = this.filters.map((f) => {
        const col = quoteIdent(f.column)
        if (f.op === "is") return `${col} IS NULL`
        if (f.op === "in") {
          const list = f.value as unknown[]
          return list.length === 0 ? "FALSE" : `${col} = ANY(${bind(list)})`
        }
        return `${col} ${f.op} ${bind(f.value)}`
      })
      return ` WHERE ${clauses.join(" AND ")}`
    }
    const returning = () => (this.returning === null ? "" : ` RETURNING ${parseColumns(this.returning)}`)

    if (this.mode === "insert") {
      if (this.rows.length === 0) throw new Error("insert() requires at least one row")
      const columns = Array.from(new Set(this.rows.flatMap((r) => Object.keys(r))))
      const valueRows = this.rows.map(
        (row) => `(${columns.map((c) => (c in row ? bind(encodeValue(c, row[c])) : "DEFAULT")).join(", ")})`,
      )
      return {
        text: `INSERT INTO ${table} (${columns.map(quoteIdent).join(", ")}) VALUES ${valueRows.join(", ")}${returning()}`,
        params,
      }
    }

    if (this.mode === "update") {
      const entries = Object.entries(this.patch).filter(([, v]) => v !== undefined)
      if (entries.length === 0) throw new Error("update() requires at least one column")
      if (this.filters.length === 0) throw new Error("update() without a filter is not allowed")
      const set = entries.map(([c, v]) => `${quoteIdent(c)} = ${bind(encodeValue(c, v))}`).join(", ")
      const text = `UPDATE ${table} SET ${set}`
      return { text: `${text}${where()}${returning()}`, params }
    }

    if (this.mode === "delete") {
      if (this.filters.length === 0) throw new Error("delete() without a filter is not allowed")
      const text = `DELETE FROM ${table}`
      return { text: `${text}${where()}${returning()}`, params }
    }

    let text = `SELECT ${parseColumns(this.columns)} FROM ${table}${where()}`
    if (this.orders.length > 0) {
      text += ` ORDER BY ${this.orders
        .map((o) => {
          const nulls = o.nullsFirst === undefined ? "" : o.nullsFirst ? " NULLS FIRST" : " NULLS LAST"
          return `${quoteIdent(o.column)} ${o.ascending ? "ASC" : "DESC"}${nulls}`
        })
        .join(", ")}`
    }
    if (this.limitCount !== null) text += ` LIMIT ${bind(this.limitCount)}`
    if (this.offsetCount !== null) text += ` OFFSET ${bind(this.offsetCount)}`
    return { text, params }
  }

  private async run(): Promise<DbResult<T>> {
    try {
      const { text, params } = this.toSQL()
      const { rows } = await this.execute(text, params)
      const hasRows = this.mode === "select" || this.returning !== null

      if (!hasRows) return { data: null, error: null }
      if (this.singleMode) {
        if (rows.length === 1) return { data: rows[0] as T, error: null }
        if (rows.length === 0 && this.singleMode === "maybeSingle") return { data: null, error: null }
        return {
          data: null,
          error: { code: "PGRST116", message: `Expected a single row, received ${rows.length}` },
        }
      }
      return { data: rows as unknown as T, error: null }
    } catch (err) {
      const e = err as { message?: string; code?: string; detail?: string }
      return { data: null, error: { message: e.message || String(err), code: e.code, details: e.detail } }
    }
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected)
  }
}

export function createDb(execute: QueryExecutor) {
  return {
    from<T = any>(table: string) {
      return new QueryBuilder<T>(table, execute)
    },
  }
}

export type Db = ReturnType<typeof createDb>
