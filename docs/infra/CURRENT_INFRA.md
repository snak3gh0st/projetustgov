# Current Infrastructure

Last updated: 2026-09-28

## Production

- App host: Hetzner `btapps` (hostname `sigma-apps`)
- Public URL: `https://projete.projetus.org`
- Runtime owner: Coolify project `projetus-hub`
- Database host: Hetzner `btdb` (hostname `sigma-db`)
- Database: `projetus_hub`
- PgBouncer: `10.0.0.2:6432`

## Operations

- App backups run on `btapps`.
- Database backups run on `btdb`.
- Projetus cron jobs run through systemd timers on `btapps`.
- The live, sanitized unit definitions are versioned in `docs/infra/systemd/`.
- `sync-leads` runs daily at 09:30 BRT; a successful run may legitimately insert zero rows when the government source has no new eligible key.

## Legacy Providers

The old Railway and Vercel configs were moved to:

- `docs/infra/legacy-providers/railway.json`
- `docs/infra/legacy-providers/web-vercel.json`

Do not use Railway or Vercel as production runtimes unless a new migration decision is made.
