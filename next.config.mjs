import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { readFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env vars from v0 sandbox for NEXT_PUBLIC_ vars to be available at build time
const envPath = '/vercel/share/.env.project'
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8')
  content.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0 && trimmed.substring(0, eqIndex).startsWith('NEXT_PUBLIC_')) {
      const key = trimmed.substring(0, eqIndex)
      let value = trimmed.substring(eqIndex + 1).trim()
      // Remove surrounding quotes
      if (value.startsWith("'")) value = value.slice(1)
      if (value.endsWith("'")) value = value.slice(0, -1)
      if (value.startsWith('"')) value = value.slice(1)
      if (value.endsWith('"')) value = value.slice(0, -1)
      process.env[key] = value
    }
  })
}

/** @type {import('next').NextConfig} */
// Cache bust v11
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
