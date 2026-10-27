/**
 * Server-side Supabase client using the service role key.
 *
 * IMPORTANT: This module must only ever be imported from server-side code
 * (API routes, Server Components, Edge Middleware). The service role key
 * bypasses RLS and must never appear in the client bundle.
 *
 * Requirements: 15.3
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Returns a Supabase client authenticated with the service role key.
 * Creates a new client on every call — callers are responsible for
 * not leaking this into client-facing paths.
 */
export function createServerClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error('Missing required environment variable: SUPABASE_URL');
  }

  return createClient(
    supabaseUrl,
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        // Disable automatic session persistence — this is a server client
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
