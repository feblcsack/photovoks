/**
 * Server-side Supabase client using the service role key.
 *
 * IMPORTANT: This module must only ever be imported from server-side code
 * (API routes, Server Components, Proxy). The service role key bypasses RLS
 * and must never appear in the client bundle.
 *
 * Two database "profiles" are supported so the app can move to a fresh
 * Supabase project without code changes (developer panel › Database):
 *   primary    SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 *   secondary  SUPABASE_URL_2 + SUPABASE_SERVICE_ROLE_KEY_2
 * `DB_ACTIVE=secondary` switches every server query to the secondary project.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type DbProfile = 'primary' | 'secondary';

export interface DbProfileConfig {
  profile: DbProfile;
  url: string | null;
  serviceKey: string | null;
  configured: boolean;
}

export function dbProfileConfig(profile: DbProfile): DbProfileConfig {
  const url =
    profile === 'primary'
      ? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null
      : process.env.SUPABASE_URL_2 ?? null;
  const serviceKey = profile === 'primary' ? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null : process.env.SUPABASE_SERVICE_ROLE_KEY_2 ?? null;
  return { profile, url, serviceKey, configured: Boolean(url && serviceKey) };
}

/** The profile all server queries use (env `DB_ACTIVE`, default primary). */
export function activeDbProfile(): DbProfile {
  return process.env.DB_ACTIVE === 'secondary' && dbProfileConfig('secondary').configured ? 'secondary' : 'primary';
}

const clients = new Map<string, SupabaseClient>();

/**
 * Returns a Supabase client authenticated with the service role key.
 * Clients are stateless (no session persistence) and are reused per process,
 * which keeps HTTP connections warm between requests.
 */
export function createServerClient(profile: DbProfile = activeDbProfile()): SupabaseClient {
  const cfg = dbProfileConfig(profile);
  if (!cfg.url) throw new Error(profile === 'primary' ? 'Missing required environment variable: SUPABASE_URL' : 'Missing SUPABASE_URL_2');
  if (!cfg.serviceKey) {
    throw new Error(`Missing required environment variable: ${profile === 'primary' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_SERVICE_ROLE_KEY_2'}`);
  }
  const key = `${cfg.url}|${cfg.serviceKey.slice(-12)}`;
  let client = clients.get(key);
  if (!client) {
    client = createClient(cfg.url, cfg.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clients.set(key, client);
  }
  return client;
}
