# SmartFMV: Supabase to Aurora PostgreSQL migration plan

## Goal
Remove Supabase from the data path. All database access runs server-side through one
`pg`-based module connected to Aurora DEV over verified SSL. Delete the Supabase project only
after a local VPN test passes.

## Phase 1: Database module (`lib/db/`)
- `config.ts`: reads DB_HOST, DB_PORT (default 5442), DB_NAME, DB_USER, DB_SSL, DB_SSL_CA_PATH,
  DB_POOL_MAX. Nothing environment-specific is hard-coded.
- `credentials.ts`: password resolution order:
  1. DB_SECRET_ARN -> AWS Secrets Manager (deployed; uses the host's IAM role).
  2. DB_PASSWORD (local development).
  3. AWS_SECRET_DEV (current Vercel variable, transitional).
  Cached in memory. The cache is cleared on an auth failure (SQLSTATE 28P01) so a rotated
  password is picked up automatically.
- `pool.ts`: one `pg.Pool` per process (global singleton, survives hot reload), max 5
  connections, 10s idle timeout. SSL with `rejectUnauthorized: true` against the Amazon RDS
  global CA bundle committed at `certs/rds-global-bundle.pem`. Retries once after refreshing
  the password.
- `query-builder.ts`: small parameterised query builder covering exactly the operations the
  app uses (select, insert, update, delete, eq, neq, in, order, range, limit, single,
  maybeSingle). Identifiers are validated against a strict pattern and double-quoted; every
  value is a `$n` parameter. It returns `{ data, error }`, so route behaviour stays identical.
  Embedded-relation selects are rejected and rewritten as explicit SQL joins.
- `index.ts`: exports `db` (builder) and `query()` (raw parameterised SQL).

## Phase 2: Replace data access
- 17 API routes and `lib/fmv-rules.ts` switch from Supabase clients to `db`.
- 4 embedded-relation queries rewritten as SQL joins: comparisons + line items,
  assessment benchmark files, assessments + line-item count, benchmark procedures + file country.
- 4 browser-side queries move behind server routes:
  - `GET /api/benchmarks/files?source=` (benchmarks page, upload refresh, wizard)
  - `GET /api/assessments/[id]/benchmark-links`

## Phase 3: Authentication seam
- `lib/auth/server.ts`: `getRequestUser(request)` behind a provider interface, selected by
  AUTH_PROVIDER. Current provider is "client-asserted" (reads the headers the app already
  sends; not secure). An `entra` provider slot is stubbed for Microsoft Entra ID.

## Phase 4: SQL for review (not run) in `scripts/aurora/`
- `001_profile_identity_mapping.sql`: add identity columns to `profiles` for Entra mapping,
  keeping existing Supabase UUIDs.
- `002_rls_option_a_disable.sql`: disable RLS on the 14 tables (recommended once server checks exist).
- `003_rls_option_b_session_vars.sql`: keep RLS using `current_setting('app.user_id')`.
- `004_app_user.sql`: least-privilege app role to replace POSDBADM.

## Phase 5: Clean-up
- Remove `@supabase/*` packages, `lib/supabase/`, and SUPABASE_* references in code.
- Rollback: the commit before this change plus the existing `pg_dump`.

## Verification
- Type-check.
- Test the query builder's generated SQL against an in-memory Postgres (pg-mem).
- End-to-end testing on a Takeda VPN laptop (the v0 preview cannot reach Aurora).
