---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/app/api/monitoramento/route.ts
  - web/src/app/monitoramento/page.tsx
autonomous: true

must_haves:
  truths:
    - "User sees convênios Em execução with saldo > 0"
    - "User sees stats cards: total monitored, total saldo, priority counts"
    - "User can filter by priority (Alta/Média/Baixa)"
    - "User can filter by saldo mínimo (default R$ 500k)"
    - "User can filter by UF and search by nome/CNPJ"
    - "User clicks Ver Detalhes and sees modal with full convênio details"
    - "Progress bars show % execução (valor_liberado / valor_global)"
  artifacts:
    - path: "web/src/app/api/monitoramento/route.ts"
      provides: "GET endpoint returning convênios Em execução with priority, stats aggregation, filters"
      exports: ["GET"]
    - path: "web/src/app/monitoramento/page.tsx"
      provides: "Monitoramento page with stats cards, filters, table, modal"
      min_lines: 250
  key_links:
    - from: "web/src/app/monitoramento/page.tsx"
      to: "/api/monitoramento"
      via: "fetch in useEffect"
      pattern: "fetch.*api/monitoramento"
    - from: "web/src/app/api/monitoramento/route.ts"
      to: "vendedor_projetos"
      via: "SQL query WHERE situacao = 'Em execução'"
      pattern: "situacao.*Em execu"
---

<objective>
Create /monitoramento page showing convênios in execution with financial tracking for sales prospecting.

Purpose: Sales team needs to identify organizations with high unspent budgets (saldo_conta) as hot leads for service offerings.

Output: Full-stack feature with API endpoint, responsive page with stats/filters/table, and detail modal.
</objective>

<execution_context>
@/Users/pauloloureiro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/pauloloureiro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/.planning/quick/3-schema-upload-base-bruta-import/3-SUMMARY.md
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/.planning/quick/4-distribuicao-leads-crm-vendedor/4-SUMMARY.md
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/lib/types.ts
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/api/dashboard/route.ts
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/api/leads/route.ts
@/Users/pauloloureiro/Desktop/Work/Sigma/Projects/Projetus/web/src/app/distribuir/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /api/monitoramento endpoint with priority calculation and stats</name>
  <files>web/src/app/api/monitoramento/route.ts</files>
  <action>
Create GET /api/monitoramento endpoint that:

1. **Auth check**: Use getApiSession() (imported from @/lib/dal). Return 401 if no session.

2. **Query convênios in execution with saldo**:
```sql
SELECT * FROM vendedor_projetos
WHERE situacao = 'Em execução'
AND saldo_conta IS NOT NULL
AND saldo_conta > 0
ORDER BY saldo_conta DESC
```

3. **Calculate priority for each row** (server-side):
- perc_execucao = (valor_liberado / valor_global) * 100 (handle null/zero)
- prioridade logic:
  - "Alta": perc_execucao < 30 AND saldo_conta >= 500000 (🔴 low execution, high remaining budget)
  - "Média": perc_execucao >= 30 AND perc_execucao <= 70
  - "Baixa": perc_execucao > 70
- Add computed fields: `prioridade` (string), `perc_execucao` (number)

4. **Apply filters from query params**:
- `prioridade`: Filter by Alta/Média/Baixa (if provided)
- `saldo_min`: Filter saldo_conta >= saldo_min (default 500000)
- `uf`: Filter by UF (if provided)
- `search`: ILIKE on nome or CNPJ (if provided)
- `limit`: Default 1000

5. **Compute aggregated stats** (from filtered results):
```ts
{
  total_monitorados: rows.length,
  total_saldo: sum(saldo_conta),
  alta_prioridade: count where prioridade === 'Alta',
  media_prioridade: count where prioridade === 'Média',
  baixa_prioridade: count where prioridade === 'Baixa'
}
```

6. **Return JSON**:
```ts
{ stats: {...}, convenios: [...] }
```

**Pattern to follow**: Match /api/leads/route.ts structure (getApiSession, dynamic params, WHERE conditions array, LEFT JOIN users for vendedor_nome if needed).

**Handle edge cases**: valor_global = 0 → perc_execucao = 0, valor_liberado null → treat as 0.
  </action>
  <verify>
```bash
# After starting dev server
curl -H "Cookie: $(cat .auth-cookie)" "http://localhost:3000/api/monitoramento?saldo_min=100000&prioridade=Alta" | jq '.stats'
```
Should return stats object with counts and convenios array with prioridade field.
  </verify>
  <done>
- /api/monitoramento returns 200 with stats + convenios
- Each convenio has prioridade and perc_execucao computed fields
- Filters (prioridade, saldo_min, uf, search) work correctly
- Stats match filtered results
  </done>
</task>

<task type="auto">
  <name>Task 2: Create /monitoramento page with stats cards, filters, table, and modal</name>
  <files>web/src/app/monitoramento/page.tsx</files>
  <action>
Create client component /monitoramento page with:

## 1. State Management
```ts
const [convenios, setConvenios] = useState<ConvenioMonitoramento[]>([])
const [stats, setStats] = useState({...})
const [filters, setFilters] = useState({
  prioridade: '',
  saldo_min: 500000,
  uf: '',
  search: ''
})
const [selectedConvenio, setSelectedConvenio] = useState<ConvenioMonitoramento | null>(null)
const [loading, setLoading] = useState(true)
```

Type ConvenioMonitoramento = VendedorProjeto + { prioridade: string, perc_execucao: number }

## 2. Data Fetching
```ts
useEffect(() => {
  const params = new URLSearchParams()
  if (filters.prioridade) params.append('prioridade', filters.prioridade)
  params.append('saldo_min', filters.saldo_min.toString())
  if (filters.uf) params.append('uf', filters.uf)
  if (filters.search) params.append('search', filters.search)

  fetch(`/api/monitoramento?${params}`)
    .then(r => r.json())
    .then(data => {
      setConvenios(data.convenios || [])
      setStats(data.stats || {})
    })
}, [filters])
```

## 3. Stats Cards (top of page)
Four glassmorphic cards in grid (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4):
- **Total Monitorados**: stats.total_monitorados, icon: 📊, accent: cyan
- **Total em Saldo**: formatCurrency(stats.total_saldo), icon: 💰, accent: cyan
- **Alta Prioridade**: stats.alta_prioridade, icon: 🔴, accent: #EF4444 (red-500)
- **Média Prioridade**: stats.media_prioridade, icon: 🟡, accent: #F59E0B (amber-500)
- **Baixa Prioridade**: stats.baixa_prioridade, icon: 🟢, accent: #10B981 (emerald-500)

Card styling: `bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-4`

## 4. Filter Bar
Horizontal flex layout with:
- **Priority buttons**: Todos (default), Alta, Média, Baixa (pill buttons with active state using cyan accent)
- **Saldo mínimo input**: Number input with R$ prefix, default 500000, onChange debounced 500ms
- **UF dropdown**: Options from unique UFs in initial data, "Todos os Estados" option
- **Search input**: Placeholder "Buscar por nome ou CNPJ", debounced 500ms

Styling: Same glassmorphic pattern as stats cards

## 5. Table
Columns:
1. **Nº Convênio**: nr_convenio (truncate if long)
2. **Organização**: nome (max 50 chars with ellipsis)
3. **UF**: uf
4. **Saldo**: formatCurrency(saldo_conta)
5. **% Execução**:
   - Progress bar (bg-gray-800, fill based on priority color)
   - Text: `${perc_execucao.toFixed(1)}%`
6. **Prioridade**: Badge with colored dot and text (🔴/🟡/🟢)
7. **Ação**: "Ver Detalhes" button (onClick opens modal)

Table styling: Same as /distribuir page (striped rows, hover states, responsive with horizontal scroll on mobile)

Empty state: "Nenhum convênio encontrado com os filtros selecionados"

## 6. Detail Modal
Triggered by "Ver Detalhes" click, shows:

**Header**: Organização nome + close button (X)

**Sections** (grid layout):
- **Informações Básicas**: nome, CNPJ, UF, município
- **Contato**: email, telefone (show "Não informado" if null)
- **Financeiro**:
  - Valor Global: formatCurrency(valor_global)
  - Valor Liberado: formatCurrency(valor_liberado)
  - Saldo em Conta: formatCurrency(saldo_conta) in cyan
- **Execução**:
  - Progress bar (full width, colored by priority)
  - Text: "Executado: X% | Saldo: Y%"
- **Análise de Prioridade**:
  - Badge with priority
  - Text explanation: "Alta prioridade - Baixa execução e alto saldo remanescente" (vary by priority)
- **Links**:
  - "Ver no TransfereGov" button (link_externo if available, otherwise disabled with tooltip)

Modal styling: Fixed inset with backdrop blur, glassmorphic card centered, max-w-2xl

Close on: X button click, backdrop click, Escape key

## 7. Formatting Helpers
Import formatCurrency, formatCNPJ from @/lib/format (already exist per prior summaries)

## 8. Sigma Dark Theme
- Background: bg-gray-950
- Cards: bg-gray-900/50 with border-gray-800
- Text: text-gray-100 (headers), text-gray-300 (body)
- Accents: cyan (#06b6d4) for primary actions
- Priority colors: red-500, amber-500, emerald-500

**DO NOT add** Export CSV button (defer to future iteration).

**Follow patterns from**: /distribuir page (glassmorphic cards, table layout, role checks), /leads page (filters, search).
  </action>
  <verify>
```bash
# Start dev server and visit
open http://localhost:3000/monitoramento

# Manual checks:
# 1. Stats cards show correct counts and sums
# 2. Priority filter buttons work (Alta shows only red badges)
# 3. Saldo mínimo filter updates results
# 4. UF filter dropdown works
# 5. Search by nome/CNPJ works
# 6. Table shows progress bars with correct colors
# 7. Click "Ver Detalhes" opens modal with full info
# 8. Modal closes on X, backdrop, Escape
# 9. Progress bars reflect execution % correctly
```
  </verify>
  <done>
- /monitoramento page loads without errors
- Stats cards display total_monitorados, total_saldo, priority counts
- Filters (priority buttons, saldo_min, uf, search) update results
- Table shows all columns with formatted values and progress bars
- Priority badges display correct colors (🔴🟡🟢)
- "Ver Detalhes" opens modal with complete convênio information
- Modal shows financial data, contact info, execution analysis
- UI matches Sigma dark theme with glassmorphism
  </done>
</task>

</tasks>

<verification>
## Overall Checks

1. **API correctness**:
```bash
curl -H "Cookie: $(cat .auth-cookie)" "http://localhost:3000/api/monitoramento?prioridade=Alta&saldo_min=1000000" | jq '.convenios[0].prioridade'
```
Should return "Alta"

2. **Priority calculation accuracy**:
- Check convenio with valor_liberado = 2M, valor_global = 10M, saldo_conta = 8M
- Should be Alta (20% execution < 30%, saldo > 500k)

3. **Filter combinations**:
- Alta + UF=SP + saldo_min=1M should return subset
- Search "prefeitura" should filter by nome ILIKE

4. **UI/UX**:
- Stats cards match filtered results (not global counts)
- Progress bars visually match % execução
- Modal displays all financial data correctly
- Responsive on mobile (table horizontal scroll, stacked stats cards)

5. **Edge cases**:
- Zero convenios: Empty state displayed
- Null email/telefone: "Não informado" shown
- Missing link_externo: Button disabled
</verification>

<success_criteria>
- GET /api/monitoramento returns 200 with stats + convenios
- Priority calculation follows business logic (< 30% = Alta, etc.)
- All filters (prioridade, saldo_min, uf, search) work correctly
- Stats cards display aggregated data from filtered results
- Table renders with progress bars colored by priority
- Priority badges display 🔴 Alta, 🟡 Média, 🟢 Baixa
- "Ver Detalhes" modal shows complete convênio information
- Modal includes financial breakdown, contact info, execution analysis
- UI follows Sigma dark theme (gray-950 bg, cyan accents, glassmorphism)
- Page is responsive (mobile-friendly table, stacked cards)
</success_criteria>

<output>
After completion, create `web/.planning/quick/5-monitoramento-financeiro/5-SUMMARY.md` with:
- What was built (API + page structure)
- Key decisions (priority thresholds, filter defaults)
- Files created/modified
- Any deviations or auto-fixes
- Verification results
</output>
