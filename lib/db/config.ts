import "server-only"
import { readFileSync } from "fs"
import path from "path"
import type { PoolConfig } from "pg"

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

let cachedCa: string | undefined

function loadCaBundle(): string {
  if (cachedCa) return cachedCa
  const caPath = process.env.DB_SSL_CA_PATH || path.join(process.cwd(), "certs", "rds-global-bundle.pem")
  cachedCa = readFileSync(caPath, "utf-8")
  return cachedCa
}

export function getDbConfig(): Omit<PoolConfig, "password"> {
  const sslMode = (process.env.DB_SSL || "require").toLowerCase()

  return {
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT || 5442),
    database: required("DB_NAME"),
    user: required("DB_USER"),
    // "disable" exists only for a local throwaway Postgres; Aurora always requires verified SSL.
    ssl: sslMode === "disable" ? false : { ca: loadCaBundle(), rejectUnauthorized: true },
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 120_000),
    application_name: "smartfmv",
  }
}
