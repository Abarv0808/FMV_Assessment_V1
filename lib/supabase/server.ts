// Supabase server client - v4 (force reload env)
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readFileSync, existsSync } from 'fs'

// Always reload env vars from v0 sandbox to pick up changes
function loadEnvVars() {
  const envPath = '/vercel/share/.env.project'
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8')
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=['\"]?([^'\"]*)['\"]?$/)
      if (match) {
        process.env[match[1]] = match[2]
      }
    })
  }
}

export async function createClient() {
  // Reload env vars on each call to pick up any updates
  loadEnvVars()
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  )
}

/**
 * Create a Supabase admin client.
 * Uses service role key if available, otherwise falls back to anon key.
 * Ensure RLS is disabled on tables if using anon key for admin operations.
 */
export function createAdminClient() {
  // Reload env vars on each call to pick up any updates
  loadEnvVars()
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  // Use service role key if available, fallback to anon key
  const key = serviceRoleKey || anonKey
  
  console.log('[v0] createAdminClient using:', serviceRoleKey ? 'service_role' : 'anon_key')
  
  return createSupabaseClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
