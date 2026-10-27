# Photovoks

A photobooth web application for paid rental events. Visitors use an iPad to select a frame, capture three photos, and receive a printed photo strip automatically.

## Project Structure

```
photovoks/
├── apps/
│   ├── web/            # Next.js App Router (booth, session page, admin)
│   └── print-station/  # Electron desktop app (macOS / Windows)
├── packages/
│   └── shared-types/   # Shared TypeScript types
└── supabase/
    └── migrations/     # SQL migration files
```

## Getting Started

```bash
pnpm install
pnpm dev
```

---

## Environment Variables

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the values before running the web app.

### Web App (`apps/web/.env.local`)

| Variable | Description | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key — safe for the client bundle | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — **SERVER SIDE ONLY. Never expose to the client or prefix with `NEXT_PUBLIC_`.** | Server only |
| `GEMINI_MODEL_NAME` | Gemini model name, e.g. `gemini-1.5-flash` — used by the sketch worker | Server only |
| `GEMINI_API_KEY` | Gemini API key — **SERVER SIDE ONLY. Never expose to the client.** | Server only |
| `ADMIN_PIN_HASH` | bcrypt hash of the admin PIN — verified server-side; the raw PIN must never appear here | Server only |
| `SUPABASE_WEBHOOK_SECRET` | Secret header value sent by Supabase database webhooks to authenticate sketch job triggers — **SERVER SIDE ONLY** | Server only |

> **Security note:** Any variable that must remain server-side must **not** be prefixed with `NEXT_PUBLIC_`. Next.js inlines `NEXT_PUBLIC_*` variables into the client bundle at build time. `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ADMIN_PIN_HASH`, and `SUPABASE_WEBHOOK_SECRET` must never use the `NEXT_PUBLIC_` prefix. See Requirements 15.3.

### Print Station (`apps/print-station/.env` or system environment)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (scoped to print jobs + heartbeat) |
| `PRINTER_NAME` | System printer name as returned by `lpstat -p` (macOS) or the Windows printer list |

---

## RLS Policy Audit

All Supabase database tables must have Row-Level Security (RLS) enabled. This is enforced by the migration files and required by Requirement 15.4.

### Audit Query

Run the following in the [Supabase SQL Editor](https://supabase.com/dashboard) to confirm RLS is enabled on all tables:

```sql
-- Run this in Supabase SQL editor to confirm RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

### Expected Result

Every row in the result must show `rowsecurity = true`. A `false` value means that table is unprotected and must have RLS enabled immediately.

| tablename | rowsecurity |
|---|---|
| `admin_users` | `true` |
| `events` | `true` |
| `frames` | `true` |
| `print_jobs` | `true` |
| `print_station_heartbeat` | `true` |
| `prompt_templates` | `true` |
| `sessions` | `true` |
| `sketch_jobs` | `true` |

If any table appears with `rowsecurity = false`, enable RLS with:

```sql
ALTER TABLE public.<tablename> ENABLE ROW LEVEL SECURITY;
```

Then add appropriate policies so legitimate access paths (service role, print station anon key, session-token-gated routes) still work correctly.

### Quick check — tables without RLS

To list only the unprotected tables (expected: zero rows):

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;
```

**Expected result:** no rows returned. If any rows are returned those tables need RLS policies applied before the system goes to production.
