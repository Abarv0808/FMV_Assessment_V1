import "server-only"
import { types } from "pg"
import { query } from "./pool"
import { createDb } from "./query-builder"

// Match the JSON shapes Supabase returned so existing app code keeps working:
// numeric/bigint as numbers, timestamptz as ISO strings, dates as YYYY-MM-DD.
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))) // numeric
types.setTypeParser(20, (v) => (v === null ? null : Number(v))) // int8
types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString())) // timestamptz
types.setTypeParser(1114, (v) => (v === null ? null : v.replace(" ", "T"))) // timestamp
types.setTypeParser(1082, (v) => v) // date

export const db = createDb(query)
export { query }
export type { Db, DbError, DbResult } from "./query-builder"
