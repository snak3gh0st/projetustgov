# Spec 2: Notificações NOVO In-App com Seen Tracking

**Data:** 2026-04-08  
**Status:** Aprovado  
**Escopo:** Badge NOVO persistente (desaparece só ao acessar) + sino com dropdown de notificações + alerta de proposta não acessada >24h para superiores. Apenas TGov (sem tocar CRM).

---

## Contexto

O CRM tem um "NOVO" baseado em tempo (48h da created_at) — puramente frontend, sem rastreamento de leitura. Para o TGov, o NOVO deve persistir até o usuário abrir a proposta, com notificações de interações e atualizações de repositório.

---

## Modelo de Dados

### Novas tabelas

```sql
-- Quem participou de uma proposta (histórico de vínculo)
CREATE TABLE tgov_proposta_participants (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposta_key  TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, proposta_key)
);

-- Quando o usuário abriu a proposta pela última vez
CREATE TABLE tgov_proposta_seen (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposta_key  TEXT NOT NULL,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, proposta_key)
);

CREATE INDEX ix_tgov_proposta_participants_user ON tgov_proposta_participants(user_id);
CREATE INDEX ix_tgov_proposta_seen_user ON tgov_proposta_seen(user_id);
```

### Novas colunas em `tgov_propostas`

```sql
ALTER TABLE tgov_propostas
  ADD COLUMN IF NOT EXISTS situacao_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tecnico_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tecnico_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL;
```

Aplicar as mesmas colunas em `propostas` está **fora do escopo** (CRM). Apenas `tgov_propostas`.

---

## Definição de "Vinculada"

| Role | Proposta vinculada quando... |
|------|------------------------------|
| **Projetista** | `tecnico_id = userId` |
| **Coord/Assistente** | É participante (comentou, criou, ou designou técnico) |
| **adm_produto/gestor** | É participante (se interagiu) |

**Inserção automática de participante:** acontece implicitamente dentro dos endpoints existentes (não há endpoint separado para gerenciar participantes).

---

## Fontes de Atividade (o que gera NOVO)

| Evento | Fonte de timestamp | Participante implícito |
|--------|-------------------|------------------------|
| Comentário novo | `tgov_comments.created_at` | autor do comentário |
| Situação mudou (sync) | `tgov_propostas.situacao_changed_at` | nenhum (automático) |
| Atribuição de técnico | `tgov_propostas.tecnico_assigned_at` | quem fez (coord/assistente) |
| Criação de proposta | `tgov_propostas.created_at` | criador |

**`situacao_changed_at`:** atualizada pelo `repo-sync` somente quando `situacao IS DISTINCT FROM $new` — sem falsos positivos.

---

## Regra de NOVO

Uma proposta tem NOVO para um usuário se:

```
(user é participante OU user é tecnico_id)
AND max(atividade_mais_recente) > COALESCE(seen_at, '1970-01-01')
```

Onde `atividade_mais_recente = MAX(comment.created_at, situacao_changed_at, tecnico_assigned_at)`.

**Marcar como visto:** ao abrir o sidecard da proposta → `UPSERT tgov_proposta_seen SET seen_at = now()`.

---

## Alerta "Projetista não acessou" (>24h)

Para `coord_aprovacao`, `assistente_aprovacao`, `adm_produto`:
- Propostas onde `tecnico_id IS NOT NULL`
- E `tecnico_assigned_at < now() - 24h`
- E o projetista não tem registro em `tgov_proposta_seen` OU `seen_at < tecnico_assigned_at`
- Filtrado: apenas propostas onde o coord/assistente é participante (designou)

Aparece no dropdown do sino em seção separada com ícone de warning.

---

## API

### `GET /api/tgov/notifications`

Retorna notificações do usuário logado.

```ts
{
  count: number,
  items: {
    propostaKey: string,
    titulo: string,
    eventType: 'comment' | 'situacao' | 'assignment',
    eventAt: string,
  }[],
  stale: {                     // só para coord/assistente/adm_produto
    propostaKey: string,
    titulo: string,
    tecnicoNome: string,
    assignedAt: string,
    hoursWithoutAccess: number,
  }[]
}
```

Permissão: `canReadTgov(session.role)`.

### `PATCH /api/tgov/seen`

Body: `{ proposta_key: string }`

Executa: `INSERT INTO tgov_proposta_seen (user_id, proposta_key, seen_at) VALUES ($1, $2, now()) ON CONFLICT (user_id, proposta_key) DO UPDATE SET seen_at = now()`

Permissão: `canReadTgov(session.role)`.

---

## Inserção Automática de Participantes

Acontece dentro dos endpoints existentes, sem endpoint separado:

| Endpoint | Quando | Insere participante para |
|----------|--------|--------------------------|
| `POST /api/tgov/comments` | Após INSERT do comment | `session.userId` |
| `PATCH /api/tgov/tecnico` | Após UPDATE tecnico_id | `session.userId` (quem atribuiu) |
| Criação de proposta (futuro) | Após INSERT | `session.userId` (criador) |

Pattern: `INSERT INTO tgov_proposta_participants (user_id, proposta_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`

---

## UI

### Badge na tabela (inline)

- API de aprovação retorna campo `hasNew: boolean` por row
- Badge amber "NOVO" ao lado do `numeroProposta` na tabela
- Clicar na row → abrir sidecard → `PATCH /api/tgov/seen` → badge desaparece

### Sino no header (NotificationBell)

- Componente no layout, visível para roles TGov
- Ícone de sino com badge de contagem (ex: "3")
- Dropdown ao clicar:
  - **Seção principal:** lista de propostas com NOVO (key + evento + quando)
  - **Seção "Sem acesso >24h"** (só coord/assistente/adm_produto): propostas designadas sem acesso pelo projetista, ícone de warning/relógio
- Clicar numa notificação → navega para `/tgov` e abre sidecard da proposta → marca como seen

### Comportamento do seen

- Abrir sidecard = visto. Todas as notificações pendentes daquela proposta somem.
- Qualquer nova atividade posterior reativa o NOVO.
- O badge no sino recalcula a contagem.

---

## Integração com repo-sync

O step de sync de situações ganha uma linha extra:

```sql
UPDATE tgov_propostas
SET situacao = $new, situacao_changed_at = now()
WHERE nr_proposta = $key AND situacao IS DISTINCT FROM $new
```

Sem `situacao_changed_at` update quando situação não muda — zero ruído.

---

## Modificações em Endpoints Existentes

| Endpoint | Mudança |
|----------|---------|
| `GET /api/tgov/aprovacao` | Retornar `hasNew` por row (LEFT JOIN com seen + activities) |
| `POST /api/tgov/comments` | + INSERT participante |
| `PATCH /api/tgov/tecnico` | + INSERT participante + SET tecnico_assigned_at/by |
| repo-sync | + SET situacao_changed_at quando situação muda |

---

## Arquivos Impactados (estimativa)

| Arquivo | Mudança |
|---------|---------|
| `migrations/create_tgov_notifications.sql` | Novas tabelas + colunas |
| `web/src/app/api/tgov/notifications/route.ts` | Novo endpoint GET |
| `web/src/app/api/tgov/seen/route.ts` | Novo endpoint PATCH |
| `web/src/app/api/tgov/aprovacao/route.ts` | + hasNew no response |
| `web/src/app/api/tgov/comments/route.ts` | + INSERT participante |
| `web/src/app/api/tgov/tecnico/route.ts` | + INSERT participante + tecnico_assigned_at/by |
| `web/src/lib/execucao-sync.ts` (ou equivalente) | + situacao_changed_at |
| `web/src/components/NotificationBell.tsx` | Novo componente |
| `web/src/app/layout.tsx` | + NotificationBell no header |
| `web/src/app/tgov/TGovDashboardClient.tsx` | Badge NOVO inline nas rows |

---

## O Que NÃO Muda

- Tabelas CRM (`propostas`, `projetos_execucao`) — fora do escopo
- Lógica de NOVO do CRM (48h baseado em created_at) — independente
- Permissões de roles (já resolvido no Spec 1)
- `tgov_comments` schema — apenas adicionamos INSERT de participante no POST handler

---

## Spec 3 (fora deste escopo)

Report diário por email (2x/dia) — reutilizará a query de `GET /api/tgov/notifications` como base.
