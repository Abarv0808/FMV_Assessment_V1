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
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match && match[1].startsWith('NEXT_PUBLIC_')) {
      process.env[match[1]] = match[2]
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
