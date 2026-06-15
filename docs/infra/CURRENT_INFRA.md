# Current Infrastructure

Last updated: 2026-06-03

## Production

- App host: Hetzner `sigma-apps`
- Public URL: `https://projete.sigmaintel.io`
- Runtime owner: Coolify project `projetus-hub`
- Database host: Hetzner `sigma-db`
- Database: `projetus_hub`
- PgBouncer: `10.0.0.2:6432`

## Operations

- App backups run on `sigma-apps`.
- Database backups run on `sigma-db`.
- Projetus cron jobs run through systemd timers on `sigma-apps`.

## Legacy Providers

The old Railway and Vercel configs were moved to:

- `docs/infra/legacy-providers/railway.json`
- `docs/infra/legacy-providers/web-vercel.json`

Do not use Railway or Vercel as production runtimes unless a new migration decision is made.
