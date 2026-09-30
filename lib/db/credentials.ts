import "server-only"
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

let cachedPassword: string | null = null

async function readFromSecretsManager(secretArn: string): Promise<string> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" })
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }))
  const raw = result.SecretString
  if (!raw) throw new Error("Database secret has no SecretString value")

  // RDS-managed secrets are JSON ({"username","password",...}); plain-text secrets are also accepted.
  try {
    const parsed = JSON.parse(raw) as { password?: string }
    if (parsed.password) return parsed.password
  } catch {
    return raw
  }
  throw new Error("Database secret JSON does not contain a password field")
}

export async function getDbPassword(): Promise<string> {
  if (cachedPassword) return cachedPassword

  const secretArn = process.env.DB_SECRET_ARN
  if (secretArn) {
    cachedPassword = await readFromSecretsManager(secretArn)
  } else {
    const password = process.env.DB_PASSWORD || process.env.AWS_SECRET_DEV
    if (!password) {
      throw new Error("No database password configured. Set DB_SECRET_ARN, DB_PASSWORD, or AWS_SECRET_DEV.")
    }
    cachedPassword = password
  }
  return cachedPassword
}

export function clearCachedDbPassword() {
  cachedPassword = null
}
