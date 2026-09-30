import { readFileSync } from 'fs'
import path from 'path'
import pg from 'pg'

const required = ['DB_HOST', 'DB_NAME', 'DB_USER']
const missing = required.filter((name) => !process.env[name])
const password = process.env.DB_PASSWORD || process.env.AWS_SECRET_DEV

if (missing.length > 0 || !password) {
  console.error('Missing database settings:', [...missing, ...(password ? [] : ['DB_PASSWORD'])].join(', '))
  process.exit(1)
}

const sslDisabled = (process.env.DB_SSL || 'require').toLowerCase() === 'disable'
const caPath = process.env.DB_SSL_CA_PATH || path.join(process.cwd(), 'certs', 'rds-global-bundle.pem')

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5442),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password,
  ssl: sslDisabled ? false : { ca: readFileSync(caPath, 'utf-8'), rejectUnauthorized: true },
})

async function cleanupOldAssessments() {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 8)
  const cutoffISO = cutoffDate.toISOString()

  console.log('Deleting assessments created before:', cutoffISO)

  await client.connect()
  try {
    const { rows: oldAssessments } = await client.query(
      'SELECT id, name, created_at FROM assessments WHERE created_at < $1',
      [cutoffISO],
    )

    console.log('Found', oldAssessments.length, 'assessments to delete:')
    oldAssessments.forEach((a) => console.log(' -', a.name, '(', a.created_at, ')'))

    if (oldAssessments.length === 0) {
      console.log('No old assessments to delete')
      return
    }

    const assessmentIds = oldAssessments.map((a) => a.id)

    await client.query('BEGIN')
    await client.query('DELETE FROM assessment_comparisons WHERE assessment_id = ANY($1::uuid[])', [assessmentIds])
    await client.query('DELETE FROM assessment_line_items WHERE assessment_id = ANY($1::uuid[])', [assessmentIds])
    await client.query('DELETE FROM assessments WHERE id = ANY($1::uuid[])', [assessmentIds])
    await client.query('COMMIT')

    console.log('Deleted', assessmentIds.length, 'assessments and their line items and comparisons')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Cleanup failed, no rows were deleted:', error.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

cleanupOldAssessments()
