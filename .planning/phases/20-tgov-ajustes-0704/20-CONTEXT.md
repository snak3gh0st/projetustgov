# Phase 20 — Ajustes TGov 07/04 (CONTEXT)

**Milestone:** v5.0 TGov Dashboard
**Created:** 2026-04-07
**Scope:** Lista "AJUSTES TGOV 07/04" — cobre itens #5 (técnico responsável) e #6 (perfil CSM + comentários TGov).

Itens resolvidos fora dessa fase (commits separados no working tree):
- ✅ #2 Bug média valor projeto (AVG → SUM/COUNT, execução KPIs dataset-wide)
- ✅ #3 Cores pizza aprovação (STATUS_COLORS, complementação em laranja forte)
- ✅ #4 Cores coluna situação (5 tiers semânticos de atenção)
- ❎ #1 Pipeline coordenação Paulo+Philipe — **pulado por decisão do usuário**

---

## Decisões travadas

### D1 — Técnico responsável: escopo em propostas E execuções
- Atribuição disponível em **propostas** (`propostas` + `tgov_propostas`) E **execuções** (`projetos_execucao` + `tgov_projetos_execucao`)
- UI: gestor pode escolher qual lado atribuir (aprovação ou execução) — não é atribuição automática cruzada
- **Por quê:** paridade com CRM vendas (que atribui vendedor a projeto), e cobertura das duas fases do ciclo TGov

### D2 — Pool de técnicos elegíveis
- Qualquer usuário com role `adm_produto`, `gestor`, ou `admin` pode ser designado como técnico
- Hoje isso significa Gustavo (único adm_produto) + gestores/admins existentes
- **Por quê:** não criar role nova só pra marcar técnico; reaproveita RBAC existente; expansível conforme Projetus cresce o time TGov

### D3 — Designação manual pelo gestor
- **Sem round-robin automático** (diferente do CRM que distribui leads automaticamente)
- Gestor escolhe manualmente via dropdown no sidecard do cliente (proposta ou execução)
- Mutations gated em `gestor`/`admin`/`adm_produto` (mesmo gate existente do TGov)
- Um técnico por registro (não múltiplos)

### D4 — Perfil CSM: nova role `csm`
- Nome técnico: **`csm`** (simples, sem sufixo)
- Adicionar ao union de roles em `web/src/types/next-auth.d.ts`
- CSM é subordinado conceitual do `adm_produto` (Gustavo gerencia CSMs)

### D5 — CSM: permissões exatas
- **TGov read:** enxerga tudo que `adm_produto` vê (propostas + execuções + sidecard + detalhes)
- **TGov write:** APENAS comentários (POST em tgov_comments). Bloqueado em:
  - whitelist (`/api/tgov/whitelist`)
  - interactions (`/api/tgov/interaction/*`)
  - técnico responsável (endpoint novo dessa fase)
  - qualquer mutation existente
- **CRM leads/vendas:** SEM acesso (não aparece no menu, rotas retornam 403)
- **Próprio perfil:** pode editar (padrão do app)

### D6 — Sistema de comentários TGov: criar do zero
- **Tabela nova:** `tgov_comments` com schema mínimo:
  - `id` serial PK
  - `target_type` text CHECK IN ('proposta', 'execucao')
  - `target_key` text (nr_proposta pra proposta, nr_convenio pra execução)
  - `author_id` int FK users(id)
  - `body` text NOT NULL
  - `created_at` timestamptz default now()
  - `updated_at` timestamptz (opcional — edição permitida só pelo autor?)
- **UI:** thread vertical no final do sidecard (tanto do ExecucaoSidecard quanto do sidecard de aprovação/proposta). Mostra autor, timestamp relativo, body. Input fixo no bottom do sidecard
- **Quem pode escrever:** `csm`, `adm_produto`, `gestor`, `admin`
- **Quem pode ler:** mesmos papeis (CSM inclusive)
- **Edição/deleção:** fora de escopo dessa fase (deferir). Comentários são append-only no v1
- **RLS:** se o projeto usa RLS (ver `migrations/enable_rls_all_tables.sql`), aplicar política equivalente

---

## Scope scout — reutilização

### Padrões existentes a espelhar
- **Notes/comments CRM (como referência de UI+API):** `web/src/app/api/leads/[cnpj]/notes/route.ts` (GET/POST), tabela `contact_notes`
- **Role gate pattern TGov:** `web/src/app/api/tgov/**/route.ts` — replicar o padrão `if (session.role !== 'gestor' && ...)` adicionando `csm` para reads e comments
- **Sidecard atual:** `ExecucaoSidecard` em `web/src/app/tgov/TGovDashboardClient.tsx` — thread de comments entra no final
- **Role union:** `web/src/types/next-auth.d.ts:7,12,19` — único lugar pra editar
- **Middleware gate TGov:** buscar no `middleware.ts` da web — precisa permitir `csm` em `/tgov/*` e bloquear em `/leads`, `/vendas`, etc.

### Arquivos que serão tocados (estimativa)
- **Migrations:** 2 novas SQL (tgov_comments, add tecnico_id a tgov_propostas/tgov_projetos_execucao/propostas/projetos_execucao)
- **Backend:**
  - `web/src/types/next-auth.d.ts` (add `csm`)
  - `middleware.ts` (gate CSM)
  - `web/src/app/api/tgov/comments/route.ts` (novo — GET/POST)
  - `web/src/app/api/tgov/tecnico/route.ts` (novo — PATCH assign)
  - `web/src/app/api/tgov/aprovacao/route.ts` + `execucao/route.ts` (join tecnico_id → nome pra exibir)
  - Todas rotas TGov mutation: adicionar bloqueio explícito de CSM
  - Rotas CRM (`/api/leads/*`, `/api/vendas/*`): bloqueio CSM
- **Frontend:**
  - `TGovDashboardClient.tsx` — sidecard ganha seção comments + dropdown técnico
  - Sidebar/menu — CSM só vê TGov
  - Página usuários (se existir UI de atribuição de role) — opção `csm`

---

## Não-decidido / research pendente

Essas perguntas vão pro RESEARCH.md do planner:

1. **Onde gravar `tecnico_id` em propostas?** Propostas vivem em 2 tabelas físicas (`propostas` do CRM + `tgov_propostas` TGov-only). O CTE `ALL_PROPOSTAS_CTE` une as duas. Adicionar coluna nas 2 tabelas ou criar uma junction table `tgov_tecnico_assignments`? Trade-off: denormalizado vs limpo.
2. **Same para execução:** `projetos_execucao` + `tgov_projetos_execucao` + propostas sem convênio (4 branches no `ALL_EXEC_CTE`). Coluna em cada ou junction?
3. **Histórico de designação:** guardar log de mudanças de técnico (quem atribuiu, quando, a quem)? Ou só current assignment?
4. **Notificação ao técnico designado:** email? In-app? Fora de escopo?
5. **RLS policies:** verificar se enable_rls_all_tables.sql aplica a tabelas TGov e se precisa escrever policies pra `tgov_comments`
6. **Middleware CSM:** mapear lista exata de rotas a permitir/negar

---

## Não está nesse escopo (deferred)

- Pipeline coordenação Paulo+Philipe (#1) — usuário pulou
- Edição/deleção de comentários (só append no v1)
- Auto round-robin de técnicos (sempre manual)
- Métricas de produtividade por técnico (carga, tempo médio de resposta, etc.)
- Menções @usuário em comentários
- Anexos em comentários
- Notificações (email/push) a técnicos designados
- Integração com CRM vendas (comentários TGov permanecem isolados)

---

## Próximo passo

1. Atualizar `ROADMAP.md` adicionando Phase 20 ao milestone v5.0
2. Rodar `/gsd:plan-phase 20` — planner vai consumir esse CONTEXT.md + RESEARCH.md
3. Planner quebra em sub-plans (estimativa: 3-4 plans — migrations, backend RBAC+comments, backend técnico, frontend)
