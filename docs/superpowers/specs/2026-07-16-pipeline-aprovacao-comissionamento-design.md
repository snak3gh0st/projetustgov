# Pipeline "Em Aprovação" + Reforma de Comissionamento - Design Spec

**Data:** 2026-07-16
**Status:** Aprovado pelo usuário

## Visão Geral

Três mudanças relacionadas no módulo de vendas (`vendedor_projetos`):

1. Reset em massa de status (operação de dados, sem código).
2. O card "Em Aprovação" passa a ser um gate real de aprovação do gestor antes do fechamento, e "Fechado" é renomeado para "Vendas Concluídas".
3. O modelo de comissionamento é reformado: fim da divisão SDR/Closer, novos percentuais fixos (Consultor 5%, Gestor 3%, Fundo Comercial 2%), visibilidade por papel, e o Fundo Comercial vira um ledger com débitos administráveis. O bônus fixo de R$50 por fechamento é removido.

## Requisito 1: Reset em Massa de Status

### Comportamento

- Todo lead com `status_contato` em `Quente`, `Muito Quente` ou `Telefone Invalido` volta para `Não Contatado`.
- Operação única, executada diretamente no banco de produção (sigmadb), sem endpoint novo.

### Execução

```sql
-- 1. Conferir impacto antes de aplicar
SELECT status_contato, count(*) FROM vendedor_projetos
WHERE status_contato IN ('Quente','Muito Quente','Telefone Invalido')
GROUP BY status_contato;

-- 2. Aplicar
UPDATE vendedor_projetos SET status_contato = 'Não Contatado'
WHERE status_contato IN ('Quente','Muito Quente','Telefone Invalido');
```

Nenhum arquivo de código muda para este requisito.

## Requisito 2: "Em Aprovação" como Gate de Fechamento

### Comportamento Atual (a remover)

- Mover um lead para `Em Aprovação` hoje faz auto-assign de `closer_id` para o gestor (hand-off SDR→Closer).
- Qualquer vendedor/coordenador dono do lead pode mover diretamente para `Fechado` via `SaleModal`, desde que `valor_venda > 0`.

### Novo Comportamento

- Mover para `Em Aprovação`: apenas troca o status. Sem auto-assign de `closer_id`. O lead continua "pertencendo" ao vendedor que fez a negociação.
- Novo campo `contrato_assinado` (boolean, default `false`) em `vendedor_projetos`. Editável apenas pelo gestor, visível no card `Em Aprovação`.
- Nenhum papel além de `gestor` pode transicionar um lead para `Vendas Concluídas` (novo nome de `Fechado`). Vendedor/coordenador só conseguem levar o lead até `Em Aprovação`.
- Nova ação **"Autorizar Fechamento"**, exclusiva do gestor:
  - Exige `contrato_assinado = true`.
  - Exige `valor_venda > 0` (mantém validação existente).
  - Ao confirmar, muda `status_contato` para `Vendas Concluídas` e dispara o cálculo/gravação de comissão (Requisito 3).
- Adicionar cliente diretamente no card `Vendas Concluídas` (fora do fluxo de aprovação) continua restrito a `gestor`, reaproveitando o mesmo padrão de checagem 403 usado em `import-existing-clients`.
- Reverter um lead de `Vendas Concluídas`/`Em Aprovação` para um status anterior continua limpando os campos de comissão travados, como hoje.

### Rename `Fechado` → `Vendas Concluídas`

- Atualizar a constante central `CRM_STATUS_CANONICAL` em `web/src/lib/crm-catalog.ts`.
- Atualizar todos os pontos que duplicam a string literal `'Fechado'` como status (não confundir com outros usos genéricos da palavra "fechado" fora do contexto de pipeline):
  - `web/src/app/leads/LeadsClient.tsx`
  - `web/src/app/HomeClient.tsx`
  - `web/src/components/LeadTable.tsx`
  - `web/src/components/LeadSlideOver.tsx`
  - `web/src/components/CsmSideCard.tsx`
  - `web/src/components/SaleModal.tsx`
  - `web/src/app/comissoes/page.tsx`
  - `web/src/app/csm/comissoes/CsmComissoesClient.tsx`
  - `web/src/app/bi/page.tsx`
  - `web/src/app/api/bi/route.ts`
  - `web/src/app/api/dashboard*/route.ts`
  - `web/src/app/api/leads/[cnpj]/route.ts`
- Não é migração de dados: linhas existentes com `status_contato = 'Fechado'` devem ser atualizadas para `'Vendas Concluídas'` junto do deploy (UPDATE único, mesma sessão do Requisito 1).

## Requisito 3: Reforma do Comissionamento

### Remover

- `CRM_COMMISSIONS.CLOSER_SPLIT_BONUS` (bônus fixo de R$50 por fechamento) — apagar a constante e todo uso (cálculo, preview no `SaleModal`, colunas de bônus em relatórios).
- Divisão SDR/Closer no fechamento: apagar o branch de "split commission" em `app/api/leads/[cnpj]/route.ts` (linhas 132–224 atuais) e os campos `closer_comissao_percentual`/`closer_comissao_valor` deixam de ser gravados em novos fechamentos (mantidos apenas como histórico em registros antigos).
- Auto-handoff de `closer_id` (já coberto no Requisito 2).

### Novo Modelo

Base de cálculo: `valor_venda` (já representa a receita negociada, não o valor total da emenda — sem campo novo).

Ao autorizar o fechamento (Requisito 2), gravar em `vendedor_projetos`:

- `consultor_comissao_pct = 5`, `consultor_comissao_valor = valor_venda * 0.05`
- `gestor_comissao_pct = 3`, `gestor_comissao_valor = valor_venda * 0.03`
- `fundo_comercial_pct = 2`, `fundo_comercial_valor = valor_venda * 0.02`

Regra do gestor vendendo:

- Se o `vendedor_id` do lead for um usuário com papel `gestor`, esse gestor recebe consultor (5%) + gestor (3%) somados nessa venda específica (8% no total).
- Em vendas de outros vendedores, o gestor recebe apenas os 3% de override — isso vale para **todo** lead fechado, independente de quem vendeu.
- Os percentuais são fixos e iguais para todos (substituem a lógica de `commission_config`/`commission_overrides` por vendedor). Essas tabelas deixam de ser consultadas no cálculo de fechamento; não serão apagadas do banco, apenas descontinuadas no fluxo (evita quebrar relatórios históricos).

### Visibilidade por Papel (aplicada na API)

- `consultor_comissao_valor`/`consultor_comissao_pct`: retornado para `vendedor` (dono do lead), `coordenador` (dono) e `gestor`.
- `gestor_comissao_valor`/`gestor_comissao_pct` e `fundo_comercial_valor`/`fundo_comercial_pct`: retornado **apenas** para `gestor`. Endpoints afetados: `app/api/comissoes/route.ts`, `app/api/csm/comissoes/route.ts`, `app/api/leads/[cnpj]/route.ts` (resposta do PATCH), `app/comissoes/page.tsx`, `app/csm/comissoes/CsmComissoesClient.tsx`.
- A restrição é feita no backend (omitindo os campos da resposta JSON para papéis não autorizados), não apenas escondendo na UI.

### Fundo Comercial como Ledger

Nova tabela `fundo_comercial_lancamentos`:

```sql
CREATE TABLE fundo_comercial_lancamentos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('credito','debito')),
  valor NUMERIC(12,2) NOT NULL,
  descricao TEXT NOT NULL,
  lead_id INTEGER REFERENCES vendedor_projetos(id),
  criado_por INTEGER NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Ao autorizar um fechamento (Requisito 2), inserir automaticamente um lançamento `credito` com `valor = fundo_comercial_valor` e `descricao = 'Fechamento: <cliente/CNPJ>'`, vinculado ao `lead_id`.
- Novo endpoint `gestor`-only (`POST/GET /api/fundo-comercial`) para lançar débitos manuais com descrição obrigatória (ex: incentivo pago ao time) e listar o extrato.
- Saldo do fundo = soma de créditos − soma de débitos, calculado on-the-fly (sem coluna de saldo materializada).
- Nova tela/seção (dentro de `app/comissoes` ou página própria `gestor`-only) mostrando extrato e saldo atual, com formulário de novo débito.

## Arquivos a Modificar

- `web/src/lib/crm-catalog.ts` — rename status, remover `CLOSER_SPLIT_BONUS`, remover percentuais fixos antigos por `tipo_vendedor`.
- `web/src/app/api/leads/[cnpj]/route.ts` — nova ação de autorização gestor-only, novo cálculo de comissão, remoção do branch de split, remoção do auto-assign em `Em Aprovação`, gate de transição para `Vendas Concluídas`.
- `web/src/components/SaleModal.tsx` — remover fluxo SDR/Closer, remover preview de bônus R$50, adaptar para novo fluxo (vendedor só vai até `Em Aprovação` diretamente do modal).
- `web/src/app/leads/LeadsClient.tsx`, `HomeClient.tsx`, `LeadTable.tsx`, `LeadSlideOver.tsx`, `CsmSideCard.tsx`, `bi/page.tsx`, `api/bi/route.ts`, `api/dashboard*/route.ts` — rename de status.
- `web/src/app/api/comissoes/route.ts`, `web/src/app/api/csm/comissoes/route.ts`, `web/src/app/comissoes/page.tsx`, `web/src/app/csm/comissoes/CsmComissoesClient.tsx` — novos campos de comissão + filtragem por papel.
- Novo: componente/checklist de aprovação no card `Em Aprovação` (checkbox `contrato_assinado` + botão "Autorizar Fechamento"), provavelmente em `LeadSlideOver.tsx` ou `LeadTable.tsx`.
- Novo: `web/src/app/api/fundo-comercial/route.ts` + tela de extrato gestor-only.
- Migração SQL (via `setup-crm/route.ts` ou script pontual): `ALTER TABLE vendedor_projetos ADD COLUMN contrato_assinado BOOLEAN DEFAULT false`, novas colunas de comissão (`consultor_comissao_pct/valor`, `gestor_comissao_pct/valor`, `fundo_comercial_pct/valor`), `CREATE TABLE fundo_comercial_lancamentos`, UPDATE de rename de status.

## Segurança

- Gate de "Autorizar Fechamento" e de acesso ao Fundo Comercial validados no backend (`session.role !== 'gestor'` → 403), não só escondidos na UI.
- Visibilidade de comissão de gestor/fundo comercial filtrada na resposta da API, não apenas no componente React.
- Reverter status limpa campos de comissão travados, evitando comissão "fantasma" em leads reabertos.

## Aceitação

- [ ] Leads com status `Quente`/`Muito Quente`/`Telefone Invalido` voltam para `Não Contatado` em produção.
- [ ] Vendedor/coordenador consegue mover lead até `Em Aprovação`, sem conseguir pular para `Vendas Concluídas`.
- [ ] Mover para `Em Aprovação` não faz mais auto-assign de closer.
- [ ] Gestor vê checkbox `contrato_assinado` e botão "Autorizar Fechamento" no card `Em Aprovação`.
- [ ] Autorizar Fechamento sem `contrato_assinado = true` é bloqueado.
- [ ] Autorizar Fechamento muda status para `Vendas Concluídas` e grava as 3 comissões (5/3/2%).
- [ ] Todo o app (UI, filtros, relatórios) usa `Vendas Concluídas` no lugar de `Fechado`.
- [ ] Vendedor não-gestor não recebe `gestor_comissao_valor` nem `fundo_comercial_valor` na resposta da API.
- [ ] Gestor vendendo pessoalmente acumula 8% (5+3) nessa venda; em vendas de outros, recebe só 3%.
- [ ] Fechamento gera lançamento de crédito automático no ledger do Fundo Comercial.
- [ ] Gestor consegue lançar débito manual com descrição no Fundo Comercial e ver o saldo atualizado.
- [ ] Bônus de R$50 não aparece mais em nenhum cálculo, preview ou relatório.
- [ ] Adicionar cliente direto em `Vendas Concluídas` continua restrito a `gestor`.
