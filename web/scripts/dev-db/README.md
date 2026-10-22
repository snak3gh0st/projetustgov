# Banco local de desenvolvimento

Dados fictícios para rodar o Projete sem tocar na produção.

```bash
# 1. Esquema da produção (só leitura, sem dados)
ssh btdb "sudo -u postgres pg_dump -d projetus_hub --schema-only --no-owner --no-privileges" > scripts/dev-db/schema.sql

# 2. Postgres local
docker run -d --name projete-devdb -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=projetus_hub -p 127.0.0.1:55491:5432 postgres:16-alpine
docker exec -i projete-devdb psql -U postgres -d projetus_hub -c "CREATE ROLE sigma_app;"
docker exec -i projete-devdb psql -U postgres -d projetus_hub < scripts/dev-db/schema.sql

# 3. Dados fictícios (usuários e senha no topo de seed.mjs)
DEV_DATABASE_URL=postgres://postgres:dev@127.0.0.1:55491/projetus_hub node scripts/dev-db/seed.mjs

# 4. .env.development.local
#   DATABASE_URL=postgres://postgres:dev@127.0.0.1:55491/projetus_hub?sslmode=disable
#   AUTH_SECRET=<openssl rand -hex 32>
#   NEXTAUTH_URL=http://localhost:3100
#   AUTH_TRUST_HOST=true
npx next dev -p 3100
```

## WhatsApp (simulador do Evolution API)

```bash
# .env.development.local
#   WHATSAPP_EVOLUTION_URL=http://127.0.0.1:8085
#   WHATSAPP_EVOLUTION_API_KEY=dev-key
#   WHATSAPP_WEBHOOK_SECRET=dev-secret
docker exec -i projete-devdb psql -U postgres -d projetus_hub < ../migrations/create_whatsapp.sql
node scripts/dev-db/evolution-mock.mjs                               # deixa rodando
node scripts/dev-db/evolution-mock.mjs inbound 61998765432 "Bom dia"  # mensagem de um contato
```

