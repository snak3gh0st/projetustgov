# Spec 3: Report Diário por Email (Digest TGov)

**Data:** 2026-04-09  
**Status:** Aprovado  
**Escopo:** Email digest personalizado 2x/dia para usuários TGov opt-in, via Resend + Vercel Cron.

---

## Contexto

Spec 2 implementou notificações NOVO in-app com seen tracking. Spec 3 reutiliza a mesma lógica de `GET /api/tgov/notifications` para enviar um digest por email 2x/dia aos usuários que optarem por receber.

---

## Provider

- **Resend** — conta do SigmaIntel, domínio do cliente
- API key: `RESEND_API_KEY` (env var)
- From: `DIGEST_FROM_EMAIL` (env var, ex: `noreply@dominio-cliente.com.br`)
- Pré-requisito: cliente configura DNS (DKIM/SPF) apontando para Resend
- Dependência npm: `resend`

---

## Modelo de Dados

### Nova coluna em `users`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest BOOLEAN NOT NULL DEFAULT false;
```

Default `false` — opt-in explícito.

---

## Opt-in UI

Na página `/cadastro-vendedor` (CadastroVendedorClient.tsx):
- Nova coluna "Digest" na tabela de usuários com toggle on/off
- Visível apenas para usuários com roles TGov (adm_produto, csm, coord_aprovacao, assistente_aprovacao, projetista)
- Toggle chama `PATCH /api/usuarios/{id}/digest` com `{ enabled: boolean }`

### `PATCH /api/usuarios/[id]/digest`

Novo endpoint:
- Permissão: gestor/admin pode alterar qualquer; adm_produto/coord/assistente podem alterar seus subordinados (mesma lógica de `canManageRole`); qualquer usuário pode alterar o próprio
- Body: `{ enabled: boolean }`
- SQL: `UPDATE users SET email_digest = $1 WHERE id = $2`

---

## Schedule

**Vercel Cron** (Pro plan):

```json
{
  "crons": [
    { "path": "/api/cron/digest", "schedule": "20 14 * * *" },
    { "path": "/api/cron/digest", "schedule": "0 22 * * *" }
  ]
}
```

UTC 14:20 = 11:20 BRT. UTC 22:00 = 19:00 BRT.

Protegido por `CRON_SECRET` (Vercel injeta `Authorization: Bearer <CRON_SECRET>` automaticamente).

---

## Endpoint: `GET /api/cron/digest`

**Flow:**

1. Valida `Authorization` header contra `CRON_SECRET`
2. Query: `SELECT id, nome, email, role FROM users WHERE email_digest = true AND active = true AND role IN ('adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'gestor', 'admin')`
3. Para cada usuário:
   a. Executa a mesma lógica de notifications (propostas com NOVO + stale >24h)
   b. Se `items.length === 0 AND stale.length === 0` → skip
   c. Se tem conteúdo → `buildDigestHtml(user, items, stale)` → envia via Resend
4. Retorna `{ sent: number, skipped: number }`

**Resend call:**
```ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

await resend.emails.send({
  from: process.env.DIGEST_FROM_EMAIL || 'noreply@projetus.com.br',
  to: user.email,
  subject: `TGov — Resumo de atividades`,
  html: buildDigestHtml(user, items, stale),
})
```

---

## Template do Email

HTML inline simples (sem framework de template). Função `buildDigestHtml(user, items, stale)`:

```
[Logo Projetus]

Olá {nome},

📋 {count} propostas com novidades

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NOVAS ATIVIDADES
• {propostaKey} — {titulo}
  {eventLabel} · {timeAgo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ SEM ACESSO HÁ +24H (só se stale.length > 0)
• {propostaKey} — {tecnicoNome} não acessou ({hours}h)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Botão: Acessar TGov Dashboard → URL do app]

Enviado por Projetus CRM · Powered by SigmaIntel
```

---

## Arquivos Impactados

| Arquivo | Mudança |
|---------|---------|
| `migrations/add_email_digest_column.sql` | Nova coluna users.email_digest |
| `web/src/lib/tgov-tables.ts` | + ALTER TABLE users ADD COLUMN email_digest |
| `web/src/app/api/usuarios/[id]/digest/route.ts` | Novo endpoint PATCH |
| `web/src/app/api/cron/digest/route.ts` | Novo endpoint GET (cron handler) |
| `web/src/lib/digest-email.ts` | buildDigestHtml + getNotificationsForUser |
| `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx` | + coluna Digest com toggle |
| `vercel.json` | + crons config |
| `package.json` | + resend dependency |

---

## O Que NÃO Muda

- Lógica de notifications in-app (Spec 2) — reutilizada, não duplicada
- Tabelas de seen/participants — apenas lidas pelo digest
- Permissões de roles (Spec 1)
- Template CRM — nenhum email para roles CRM

---

## Dependências

- **Spec 2 completa** (tabelas tgov_proposta_participants, tgov_proposta_seen, notifications logic)
- **Resend API key** configurada no env
- **DNS do cliente** com DKIM/SPF para Resend
- **CRON_SECRET** configurado no Vercel
