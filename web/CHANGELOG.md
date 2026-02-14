# Changelog - PROJETUS CRM

## [2026-02-13] - Correções Críticas de Bugs e Distribuição Automática

### 🐛 Correções de Bugs (Quick Task 5)

#### Visão Administrativa
- ✅ **Corrigido erro ao clicar em "Ver Detalhes" do lead**
  - Função `updateContact` movida após definição da variável `first`
  - Elimina erro runtime que impedia visualização de detalhes

- ✅ **Botão "Atribuir" vs "Reatribuir" implementado**
  - Leads não atribuídos mostram "Atribuir"
  - Leads já atribuídos mostram "Reatribuir" + nome do vendedor
  - Elimina confusão sobre status de atribuição

- ✅ **Destaque visual de leads prioritários melhorado**
  - Substituído pequeno ponto vermelho por destaque de linha completa
  - Cor: `bg-red-500/10` com borda `border-l-2 border-l-red-500`
  - Muito mais visível e fácil de identificar

- ✅ **Colunas truncadas agora mostram conteúdo completo**
  - Tooltips adicionados em: Nome, Parlamentar, Ministério, Município
  - Larguras aumentadas: Nome (250px), Ministério (180px)
  - Hover sobre colunas mostra texto completo

- ✅ **Campo "Detalhes/Observações" sempre visível**
  - Visível e editável no slide-over quando `canModify=true`
  - Visualizadores veem apenas leitura
  - Não precisa mais de modo de edição especial

#### Visão Vendedor
- ✅ **Valor de venda para leads "Fechado"**
  - Prompt automático ao mudar status para "Fechado"
  - Campo `valor_venda` adicionado ao schema do banco
  - Valor exibido no slide-over quando lead está fechado

- ✅ **Separação de comissão e taxa de fechamento**
  - Dashboard vendedor agora mostra dois cards separados:
    - "Comissão Vendas" (baseada em percentual)
    - "Taxa Fechamento" (R$50 por fechamento)
  - Pipeline bar mostra cálculo: "N × R$50 = R$XXX" abaixo da contagem "Fechado"

### 🎲 Nova Funcionalidade: Distribuição Automática de Leads

#### Script de Distribuição Round-Robin
- ✅ **Script criado**: `web/scripts/distribute-leads.js`
- ✅ **Algoritmo**: Round-robin para distribuição equilibrada
- ✅ **Primeira execução**: 3,188 CNPJs distribuídos entre 4 vendedores
  - Elisson: 819 leads
  - Gabriel: 812 leads
  - Vitoria: 797 leads
  - Wellington: 824 leads

#### Funcionalidades do Script
- Busca automática de vendedores ativos
- Agrupa leads por CNPJ (todas as emendas do mesmo CNPJ vão para o mesmo vendedor)
- Distribuição equilibrada usando round-robin
- Relatório detalhado de distribuição
- Estatísticas finais por vendedor

### 📦 Arquivos Modificados

#### Frontend
- `web/src/app/leads/page.tsx` - Melhorias UX da tabela, prompt de valor de venda
- `web/src/app/lead/[cnpj]/page.tsx` - Correção de erro runtime, prompt de valor de venda
- `web/src/components/LeadSlideOver.tsx` - Detalhes sempre visíveis, exibição de valor de venda
- `web/src/app/page.tsx` - Cards de comissão/fechamento separados, anotação no pipeline

#### Backend
- `web/src/app/api/leads/[cnpj]/route.ts` - Suporte para campo `valor_venda` no PATCH

#### Tipos
- `web/src/lib/types.ts` - Campo `valor_venda` adicionado a `VendedorProjeto`

#### Scripts
- `web/scripts/distribute-leads.js` - Script de distribuição automática de leads (NOVO)

### 🔧 Commits

1. `aa215ef` - fix(quick-5): fix lead detail error, improve leads table UX
2. `32e9187` - feat(quick-5): add sale value input and separate commission/closing fee
3. `d4c2142` - docs(quick-5): complete critical CRM bugs and UX improvements
4. `efb702f` - docs(quick-5): add planning artifacts
5. `8f3c6c4` - feat: add automatic round-robin lead distribution script

### 📝 Issues Adiados

Dois problemas reportados pelo cliente foram adiados para investigação posterior:

1. **"Roleta de vendedores"** - Sistema de distribuição automática foi implementado via script
2. **"Banco de dados velho vs novo"** - Requer análise mais profunda do pipeline ETL

---

## Como Usar

### Distribuição Automática de Leads

Para distribuir novos leads não atribuídos:

```bash
cd web
node scripts/distribute-leads.js
```

O script automaticamente:
- Busca todos os leads não atribuídos
- Busca todos os vendedores ativos
- Distribui usando algoritmo round-robin
- Mostra relatório final com estatísticas

### Valor de Venda para Leads Fechados

1. Acesse um lead no CRM
2. Mude o status para "Fechado"
3. Um prompt aparecerá solicitando o valor da venda
4. Digite o valor (ex: "50000") e confirme
5. O valor aparecerá no slide-over do lead

---

**Última atualização:** 2026-02-13
**Versão:** v3.0 CRM de Vendas - Quick Task 5 Complete
