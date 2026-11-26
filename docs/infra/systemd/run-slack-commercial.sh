#!/usr/bin/env bash
set -euo pipefail
# Read credentials only inside the running Projete container; never source a dotenv file in a shell.
container="$(docker ps --filter 'name=^/ohxmnamg1umgut184jgi2o57-' --format '{{.ID}}' | head -n 1)"
: "${container:?No running Projete container}"
docker exec -i "$container" node --input-type=module <<'JS'
if (!process.env.CRON_SECRET) throw new Error('Cron credential not configured')
const response = await fetch('https://projete.projetus.org/api/cron/slack-comercial', {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(120000)
})
const data = await response.json().catch(() => ({ error: 'invalid_response' }))
console.log(JSON.stringify({ status: response.status, ...data }))
if (!response.ok) process.exitCode = 1
JS
