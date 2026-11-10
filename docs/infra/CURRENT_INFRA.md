# Current Infrastructure

Last updated: 2026-11-09

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
- `sync-conta-azul` runs daily at 05:00 BRT and pulls the Conta Azul finance data for the Financeiro area; its drop-in `projetus-cron@sync-conta-azul.service.d/timeout.conf` sets `CRON_CURL_MAX_TIME=900` because a full import can take up to 12 minutes.
- `sync-leads` runs daily at 09:30 BRT; a successful run may legitimately insert zero rows when the government source has no new eligible key.

- `relatorio-semanal` está configurado para `philipe@projetus.org`, sexta às 18h de Brasília. Verificação de 09/11: timer ativo e execução de 06/11 concluída sem erro; o retrato semanal está registrado no banco. O timer versionado declara `America/Sao_Paulo` explicitamente.
- A operação integrada usa os timers `financeiro-sync` (15 minutos), `financeiro-report` (05:30 BRT) e `financeiro-statements` (05:45 BRT). Instalar seus arquivos após publicar as rotas homônimas e aplicar a migração `20261105_financeiro_integrado.sql`; copiar também o drop-in de timeout da sincronização. Canais opcionais e escrita no ERP começam desabilitados.

## Legacy Providers

The old Railway and Vercel configs were moved to:

- `docs/infra/legacy-providers/railway.json`
- `docs/infra/legacy-providers/web-vercel.json`

Do not use Railway or Vercel as production runtimes unless a new migration decision is made.
