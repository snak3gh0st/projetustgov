# Etapa 4: Card do lead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/lead/[cnpj]` vira o lugar único do lead: cabeçalho com os dados do CNPJ e os responsáveis, linha do tempo única no centro (movimentações + notas, com caixa de nota embaixo) e coluna direita com reunião, emendas por funil, contatos e comissão quando a regra permitir.

**Architecture:** A página continua cliente e busca os mesmos dados de hoje (`/api/leads?search=`, `/api/execucao/[cnpj]`, `/api/leads/[cnpj]/notes`, `/api/leads/[cnpj]/historico`). Uma função pura (`buildTimeline`) junta notas e eventos, ordena e filtra. Componentes novos em `components/lead-card/`. Nenhuma API muda; as regras de permissão de hoje continuam (status por emenda em Aprovação, status por CNPJ em Execução/Prestação, `canEditLeads`, `canReopenClosedSale`).

**Tech Stack:** Next.js 14 cliente, node:test, componentes `ui/*` e `leads/list-ui`.

**Spec:** `docs/superpowers/specs/2026-10-21-areas-por-equipe-design.md` (seção "Card do lead" e a decisão "Card do lead com vários projetos no mesmo CNPJ").

## Global Constraints

- Cabeçalho só com dados do CNPJ (nome, CNPJ, município/UF) e responsável(is). Status fica por projeto, na coluna de emendas.
- Filtros da linha do tempo hoje: Tudo, Notas, Movimentações. WhatsApp, Email e Slack só quando as integrações existirem.
- Caixa de resposta embaixo da linha do tempo: hoje adiciona nota (tipo + texto).
- Próxima reunião: sem Meet, o botão "Agendar" que já existe (Google Agenda); se algum projeto está em "Reunião Agendada", diz isso.
- Comissão só quando a API já entrega o valor (redação de `/api/leads` por papel continua valendo).
- `LeadSlideOver` continua com "Abrir card".
- Sem `alert()`/`confirm()`: toasts e confirmação inline. Sem travessão na cópia. Tokens do tema, claro e escuro, 375 px sem rolagem lateral.
- NewsBanner v1.11.

## Review Focus

1. CNPJ com várias emendas e donos diferentes: cabeçalho lista os responsáveis distintos; cada emenda mantém o próprio controle de status.
2. Lead só de Execução (sem linha em `vendedor_projetos` visível): o card abre com convênios e linha do tempo, sem quebrar.
3. Visualizador e CSM: tudo travado (status, contato, notas), mas a linha do tempo e os contatos aparecem.
4. Venda fechada: vendedor não reabre (select travado); gestor autoriza fechamento pelo fluxo de hoje (Em Aprovação + contrato assinado + SaleModal).
5. Nota criada, editada ou excluída aparece na linha do tempo na hora, na posição certa.

---

### Task 1: `buildTimeline` e helpers de funil (puros)

**Files:** Create `web/src/lib/lead-timeline.ts`, `web/src/lib/lead-timeline.test.ts`

```ts
export type TimelineFilter = 'tudo' | 'notas' | 'movimentacoes'
export type TimelineItem =
  | { kind: 'nota'; id: string; at: string; note: TimelineNote }
  | { kind: 'evento'; id: string; at: string; event: TimelineEvent }
export function buildTimeline(notes: TimelineNote[], events: TimelineEvent[], filter: TimelineFilter): TimelineItem[]  // ordem cronológica crescente
export function faseDaSituacao(situacao: string | null): 'execucao' | 'prestacao_contas' | null
export function execucaoStatusDoCnpj(statuses: (string | null)[]): string  // mesma ordem de normalizedStatusOrderSql
export function responsaveis(rows: { vendedor_nome?: string | null }[]): string[]
```
- [ ] Testes: mistura ordenada por data crescente; filtros; empate estável; fase da situação ("Em execução", "Prestação de Contas em Análise", "Concluído" → null); status do CNPJ escolhe o mais avançado; responsáveis distintos sem vazios. RED → GREEN → commit.

### Task 2: Linha do tempo com caixa de nota

**Files:** Create `web/src/components/lead-card/LeadTimeline.tsx`
- Busca notas e histórico; `SectionTabs` com os 3 filtros e contagens; nota = autor, tipo, texto, hora, editar/excluir (quem pode editar hoje), confirmação inline; evento = `LeadEventLine`. Caixa embaixo: tipo (select) + texto + "Adicionar nota" (Ctrl/Cmd+Enter envia). `refreshKey` recarrega o histórico quando o status muda. Rola para o fim ao carregar.
- [ ] tsc, commit.

### Task 3: Coluna direita

**Files:** Create `web/src/components/lead-card/EmendasAprovacao.tsx`, `ConveniosExecucao.tsx`, `ReuniaoCard.tsx`
- Emendas (Aprovação): por emenda, parlamentar, órgão, valor, `StatusSelect` com a regra atual, observação, link.
- Convênios (Execução/Prestação): número, situação com fase, valor, % execução; um `StatusSelect` por CNPJ (PATCH `/api/execucao/[cnpj]`), travado como na lista (`isGestor || !canEditLeads`).
- Reunião: "Reunião marcada" quando houver; botão "Agendar no Google Agenda".
- Contatos: telefone/email do lead (edição de hoje) + `LeadContacts`.
- [ ] tsc, commit.

### Task 4: Página

**Files:** Modify `web/src/app/lead/[cnpj]/page.tsx`
- Cabeçalho (voltar, nome, CNPJ, cidade/UF, responsáveis, selos de prioridade/cliente existente, WhatsApp/Email). Faixa "Em Aprovação" com autorizar/cancelar para gestor. Grid `lg:grid-cols-[minmax(0,1fr)_380px]`: linha do tempo | coluna direita. Comissão na coluna direita. Toasts no lugar de `alert()`. Fallback só-Execução no mesmo layout.
- [ ] Navegador: vendedora, gestor, visualizador; claro, escuro, 375 px. Commit.

### Task 5: Novidades, build, revisão final
- [ ] NewsBanner v1.11, suite, tsc, lint, `next build`, revisão por subagente, correções com teste, commit.
