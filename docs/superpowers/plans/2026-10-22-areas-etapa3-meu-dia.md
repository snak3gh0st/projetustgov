# Etapa 3: Meu dia (consultor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela inicial do consultor ("Meu dia") com o que fazer hoje, a partir dos dados que já existem: novos leads, leads parados e reuniões agendadas, nos três funis.

**Architecture:** Um endpoint `GET /api/meu-dia` busca os leads do usuário em dois blocos (Aprovação: linhas de `vendedor_projetos`; Execução/Prestação: CNPJs de `projetos_execucao` com dono), com as mesmas regras de escopo, status e "dias sem contato" das abas de Leads. Uma função pura (`classifyMeuDia`) separa os candidatos em três listas. A página `/meu-dia` mostra as listas e recarrega ao voltar o foco. O vendedor abre em Meu dia: `/` redireciona para `/meu-dia`, e o Pipeline dele passa para `/pipeline`. Os demais perfis seguem em `/` como hoje.

**Tech Stack:** Next.js 14 app router, Postgres (`query` de `@/lib/db`), node:test via `npx tsx --test`, componentes de `web/src/components/ui` e `components/leads/list-ui`.

**Spec:** `docs/superpowers/specs/2026-10-21-areas-por-equipe-design.md` (seções "Comercial: tela inicial do consultor", "Entrega em etapas" item 3, "Deixado ao construtor").

## Global Constraints

- Itens 1 e 2 do Meu dia (Meet e conversas) só aparecem quando as integrações existirem: não entram agora.
- Vale para os três funis; Aprovação usa `status_contato`, Execução e Prestação usam `status_contato_execucao`. Cada item mostra o funil.
- Clicar num item abre o card do lead (`/lead/[cnpj]`).
- O item sai quando deixa de cumprir a regra; lista vazia mostra "tudo em dia", não um vazio cinza.
- Sem comissão e sem números da equipe (o endpoint não seleciona colunas de comissão).
- Coordenador abre no Pipeline da equipe, com Meu dia no menu.
- Cópia sem travessão, verbo + objeto nos botões, "áreas" nunca "hub".
- Bump do NewsBanner.

## Review Focus

1. Lead novo inserido já com dono (import, cadastro CSM) não tem evento `atribuicao`: "recente" cai para `vp.created_at`.
2. Lead nunca contatado com mais de 7 dias: `days_since_last_contact` é NULL; não entra em "parados" (regra literal da spec). Ruling registrado, citado ao usuário.
3. O mesmo CNPJ pode aparecer em Aprovação e em Execução/Prestação: são itens separados, com o funil marcado. CNPJ nas duas fases do TransfereGov vira um item só, marcado Execução.
4. Coordenador como closer: o escopo de Aprovação é dono ou closer, como em `/api/leads`; em Execução, só dono (`vendedor_id`), como no filtro de `/api/execucao`.
5. Vendedor que abre `/` (sessão já ativa, sem passar pelo login) cai em Meu dia; links e logo para `/` continuam funcionando.

---

### Task 1: Regras do Meu dia (pura)

**Files:** Create `web/src/lib/meu-dia.ts`, `web/src/lib/meu-dia.test.ts`

**Interfaces — Produces:**
```ts
export type MeuDiaFunil = 'aprovacao' | 'execucao' | 'prestacao_contas'
export interface MeuDiaCandidate { cnpj: string; nome: string | null; municipio: string | null; uf: string | null
  funil: MeuDiaFunil; status: string; atribuido_em: string | null; dias_sem_contato: number | null }
export interface MeuDiaItem extends MeuDiaCandidate { motivo: 'novo' | 'parado' | 'reuniao' }
export interface MeuDia { novos: MeuDiaItem[]; parados: MeuDiaItem[]; reunioes: MeuDiaItem[] }
export const NOVO_JANELA_DIAS = 7
export const PARADO_DIAS = 7
export function classifyMeuDia(candidates: MeuDiaCandidate[], now: Date): MeuDia
```

Regras (status já normalizado por `normalizeCrmStatus`): `reunioes` = status "Reunião Agendada"; `novos` = "Não Contatado" e `atribuido_em` nos últimos 7 dias; `parados` = `dias_sem_contato > 7`, fora dos desfechos (Fechado, Sem Interesse, Churn, e os motivos de histórico Impedimento Técnico e Cancelado), e não está em outra lista. Cada lead aparece numa lista só (reunião > novo > parado). Ordem: novos pelo mais recente, parados pelo mais tempo parado, reuniões por nome.

- [ ] Testes: reunião vai só para reuniões mesmo parada; não contatado atribuído há 2 dias é novo, há 10 dias não aparece; contatado há 8 dias é parado, há 7 não; Fechado/Sem Interesse/Churn parados não aparecem; ordenações; candidatos vazios dão listas vazias.
- [ ] RED, implementar, GREEN, commit.

### Task 2: Menu, entrada do vendedor e Pipeline em `/pipeline`

**Files:** Modify `web/src/lib/areas.ts`, `web/src/lib/areas.test.ts`, `web/src/app/page.tsx`, `web/src/middleware.ts`, `web/src/components/NavIcon.tsx`; Create `web/src/app/pipeline/page.tsx`

- Comercial: `{ href: '/meu-dia', label: 'Meu dia', icon: 'hoje', roles: ['vendedor'] }` antes do Pipeline; Pipeline do vendedor em `{ href: '/pipeline', label: 'Pipeline', icon: 'pipeline', roles: ['vendedor'] }`; o item `/` sai do vendedor; coordenador ganha Meu dia depois do Pipeline.
- `/` redireciona vendedor para `/meu-dia`. `/pipeline` renderiza `HomeClient` (outros perfis em `/pipeline` vão para `/`).
- Middleware: `/meu-dia` e `/pipeline` entram em `CRM_PAGE_PATHS`.
- [ ] Testes: primeiro item do vendedor é `/meu-dia` (areaHome); vendedor alcança Pipeline em `/pipeline`; coordenador tem `/` primeiro e `/meu-dia` no menu; gestor, diretoria e visualizador sem Meu dia; `reaches()` conta `/` do vendedor como `/pipeline`. RED, implementar, GREEN, commit.

### Task 3: `GET /api/meu-dia` e dados locais

**Files:** Create `web/src/app/api/meu-dia/route.ts`; Modify `web/scripts/dev-db/seed.mjs`

- Só `isSeller` (vendedor, coordenador); outros 403.
- Aprovação: linhas com `vendedor_id = $1 OR closer_id = $1`, agrupadas por CNPJ; status = o mais avançado pela ordem de `normalizedStatusOrderSql(normalizedStatusSql('vp.status_contato'))`; dias = `GREATEST(nota mais recente do usuário, updated_at das linhas do usuário fora de Não Contatado)`, como `/api/leads`; `atribuido_em` = último `lead_events.atribuicao` para o usuário naquele CNPJ, senão o `created_at` mais recente das linhas dele.
- Execução/Prestação: CNPJs de `projetos_execucao` em uma das duas fases (`execucaoFaseSql`) com linha em `vendedor_projetos` de `vendedor_id = $1`; status = `crm_statuses` de `/api/execucao`; dias = notas do CNPJ (`last_contact` de `/api/execucao`); funil = execução se houver convênio em execução, senão prestação.
- Responde `classifyMeuDia(...)`.
- Seed: três leads Não Contatado reatribuídos agora para `vendedora@dev.local` (passam pelo trigger e geram `atribuicao`).
- [ ] Verificar com curl logado (vendedora): as três listas com itens; visualizador e gestor 403. Commit.

### Task 4: Página `/meu-dia`

**Files:** Create `web/src/app/meu-dia/page.tsx`, `web/src/app/meu-dia/MeuDiaClient.tsx`

- Servidor: só vendedor e coordenador; outros vão para `/`.
- Cliente: `PageHeader` "Meu dia" com a data de hoje; três seções (Novos leads para você, Leads parados, Reunião agendada) com contagem; item = nome, município/UF, `Tag` do funil, pílula de status e o motivo ("atribuído há 2 dias", "14 dias sem contato"); o item inteiro é link para `/lead/[cnpj]`. Skeleton ao carregar, toast em erro, recarrega em `visibilitychange`/`focus` e a cada 60 s. Tudo vazio: estado "Tudo em dia". Seção vazia: uma linha curta.
- Motion: entrada leve em sequência nas listas, com `prefers-reduced-motion` respeitado pelo `MotionConfig`.
- [ ] Ver no navegador: claro, escuro, 375 px sem rolagem lateral. Commit.

### Task 5: Novidades, build, revisão final

- [ ] NewsBanner v1.10. Suite verde, tsc, lint, `next build` (dev parado e `.next` removido; reiniciar dev depois). Revisão final por subagente. Commit.
