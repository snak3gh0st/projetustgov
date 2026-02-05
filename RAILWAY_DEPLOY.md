# Deploy no Railway - Guia de Configuração

## ✅ Status Atual

### Configurado automaticamente:
- ✅ Projeto Railway criado: `projetus`
- ✅ PostgreSQL adicionado e configurado
- ✅ Variáveis de ambiente configuradas:
  - `DATABASE_URL` (injetada automaticamente)
  - `TELEGRAM_BOT_TOKEN` (placeholder - precisa atualizar)
  - `TELEGRAM_CHAT_ID` (dummy - precisa atualizar)
- ✅ Arquivos de configuração criados:
  - `railway.json`
  - `Dockerfile.railway`

### URL do Projeto:
https://railway.com/project/0e2ea3d9-b068-4236-bf70-0031c0f51b28

---

## 📋 Próximos Passos (Configuração Manual)

### 1. Criar Serviço da API

1. Acesse o dashboard: https://railway.com/project/0e2ea3d9-b068-4236-bf70-0031c0f51b28
2. Clique em **"+ New"** → **"Empty Service"**
3. Nomeie como: `projetus-api`
4. Configure a fonte:
   - Clique no serviço → **Settings** → **Source**
   - Selecione **GitHub Repo**
   - Escolha o repositório do projeto
5. Configure o deploy:
   - **Builder**: Dockerfile
   - **Dockerfile Path**: `Dockerfile.railway`

### 2. Configurar Variáveis de Ambiente (para o serviço API)

No serviço `projetus-api`, vá em **Variables** e adicione:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
TELEGRAM_BOT_TOKEN=seu_token_aqui
TELEGRAM_CHAT_ID=seu_chat_id_aqui
```

### 3. Configurar Health Check

No serviço `projetus-api`, vá em **Settings** → **Healthcheck**:
- **Path**: `/health`
- **Timeout**: 100s

### 4. Deploy

Clique em **Deploy** para fazer o deploy da aplicação.

---

## 🔍 Como Testar

Após o deploy, o Railway fornecerá uma URL pública. Teste com:

```bash
# Health check
curl https://<sua-url>.railway.app/health

# Root endpoint
curl https://<sua-url>.railway.app/
```

---

## 📝 Comandos Úteis (CLI)

```bash
# Ver logs
railway logs

# Ver status
railway status

# Abrir dashboard
railway open

# Configurar variáveis
railway variables --set "TELEGRAM_BOT_TOKEN=token_real"

# Fazer deploy
railway up
```

---

## 🔧 Configuração de Rede

O PostgreSQL está acessível internamente via:
- **Host**: `postgres.railway.internal`
- **Port**: `5432`
- **Database**: `railway`
- **User**: `postgres`

A aplicação usará automaticamente a variável `DATABASE_URL` para conectar.

---

## ⚠️ Notas Importantes

1. **Tokens Telegram**: Você precisa de um bot real do Telegram:
   - Crie um bot com @BotFather
   - Obtenha o token
   - Obtenha o chat ID com @userinfobot

2. **Schema do Banco**: A primeira execução criará as tabelas automaticamente (se configurado no código)

3. **Scheduler**: Para rodar o scheduler diariamente, configure um cron job separado ou use o próprio agendador do Railway
