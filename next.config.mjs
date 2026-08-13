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
  async headers() {
    return [
      {
        // API responses are always live data. Without an explicit Cache-Control,
        // a response with no ETag/Last-Modified is eligible for *heuristic*
        // caching (RFC 9111) by the browser HTTP cache and, more importantly, by
        // corporate/enterprise forward proxies. That is how a user could run a
        // comparison and keep being served the stale pre-comparison JSON for
        // hours, while the same flow looks instant on a network that doesn't
        // cache. no-store (plus the legacy Pragma/Expires pair for older
        // proxies) makes every API read uncacheable end-to-end.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        // Baseline hardening for the deployed app.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
        ],
      },
    ]
  },
}

export default nextConfig
