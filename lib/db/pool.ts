import "server-only"
import { Pool, type QueryResultRow } from "pg"
import { getDbConfig } from "./config"
import { clearCachedDbPassword, getDbPassword } from "./credentials"

const INVALID_PASSWORD = "28P01"

const globalForDb = globalThis as unknown as { smartfmvPool?: Pool }

function createPool(): Pool {
  const pool = new Pool({ ...getDbConfig(), password: getDbPassword })
  pool.on("error", (err) => {
    console.error("[db] Idle client error:", err.message)
  })
  return pool
}

function getPool(): Pool {
  if (!globalForDb.smartfmvPool) globalForDb.smartfmvPool = createPool()
  return globalForDb.smartfmvPool
}

async function resetPoolAfterAuthFailure() {
  clearCachedDbPassword()
  const old = globalForDb.smartfmvPool
  globalForDb.smartfmvPool = undefined
  await old?.end().catch(() => undefined)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches the untyped Supabase client the routes were written against
export async function query<T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  try {
    const result = await getPool().query<T>(text, params)
    return { rows: result.rows, rowCount: result.rowCount ?? 0 }
  } catch (err) {
    if ((err as { code?: string }).code !== INVALID_PASSWORD) throw err
    // Password was probably rotated in Secrets Manager: re-read it and retry once.
    await resetPoolAfterAuthFailure()
    const result = await getPool().query<T>(text, params)
    return { rows: result.rows, rowCount: result.rowCount ?? 0 }
  }
}
