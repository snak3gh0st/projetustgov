# CSM Side Card + CRM Interno - Design Spec

**Data:** 2026-04-30
**Status:** Aprovado pelo usuário

---

## Visão Geral

Adicionar side card ao módulo CSM para exibir dados detalhados do cliente ao clicar, + seção de CRM interno com mesma interface do CRM Execution.

---

## Requisito 1: Side Card ao Clicar no Cliente

### Comportamento
- **Click na linha do cliente** → abre Side Card (slide-over) no lado direito
- **Click fora** ou no "X" → fecha o side card
- Não interfere no expand/collapse existente da linha

### Layout do Side Card

```
┌─────────────────────────────────┐
│ ×                    Cliente    │
├─────────────────────────────────┤
│ Nome do Proponente              │
│ CNPJ: XX.XXX.XXX/XXXX-XX        │
├─────────────────────────────────┤
│ CONTATO PRINCIPAL              │
│ Maria Silva - Diretora          │
├─────────────────────────────────┤
│ CONTATOS                       │
│ ☑ Maria Silva     (11) 99999-9999 │
│   João Santos     (11) 88888-8888 │
├─────────────────────────────────┤
│ TELEFONE / WHATSAPP             │
│ 📱 (11) 99999-9999  → WhatsApp │
│ 📧 email@proponente.com.br     │
├─────────────────────────────────┤
│ LOCALIZAÇÃO                     │
│ São Paulo / SP                  │
├─────────────────────────────────┤
│ PROJETOS                       │
│ 12345 - Projeto ABC    [PAD]    │
│   Situação: Em Execução         │
│                                 │
│ 12346 - Projeto XYZ    [PAD]   │
│   Situação: Prestação de Contas │
└─────────────────────────────────┘
```

### Campos

| Seção | Campos |
|-------|--------|
| Header | Nome proponente, CNPJ formatado |
| Contato Principal | nome_pessoa, cargo (do lead_contacts com principal=true) |
| Contatos | Lista: nome_pessoa, telefone, email, telefone_status |
| Telefone/WhatsApp | Telefone clicável → `wa.me/55{digits}`, Email clicável → mailto |
| Localização | UF, Município (do projeto ou proponente) |
| Projetos | identifier, objeto, situacao, link PAD |

### API de Dados

Endpoint existente `/api/csm/clients/[cnpj]/contacts` retorna dados dos contatos.
Endpoint existente `/api/csm/clients/[cnpj]/projects` retorna projetos.

### Link PAD

```typescript
const getPadUrl = (nrConvenio: string) => 
  `https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta/ResultadoDaConsultaDeConvenioSelecionarConvenio.do?idConvenio=${nrConvenio}&destino=`
```

---

## Requisito 2: CRM Interno no CSM

### Comportamento
- Nova aba/tab no CSM ("CRM" ou "Clientes")
- Carrega interface completa do CRM Execution
- Filtro automático: mostra apenas clientes do portfólio CSM atual

### UI

```
┌──────────────────────────────────────────────────┐
│ [Dashboard] [Projetos] [CRM] [Comissões]         │
├──────────────────────────────────────────────────┤
│ Filtros: Buscar | Status Contato | UF | ...     │
├──────────────────────────────────────────────────┤
│ Tabela de Clientes/L Leads                     │
│ (mesma estrutura do CRM Execution)            │
└──────────────────────────────────────────────────┘
```

### Implementação

- Reutilizar `<CrmDashboardClient />` ou componente equivalente
- Passar filtro por CNPJs do portfólio CSM
- Manter todos os filtros e funcionalidades existentes

---

## Componentes a Criar/Modificar

| Tipo | Arquivo | Ação |
|------|--------|------|
| Novo | `CsmSideCard.tsx` | Componente de slide-over |
| Modificar | `CsmDashboardClient.tsx` | Adicionar click handler para abrir side card |
| Modificar | `CsmPageClient.tsx` ou `page.tsx` | Adicionar navegação de abas |

---

## Aceitação

- [ ] Click no cliente abre side card com dados
- [ ] Telefone abre WhatsApp em nova aba
- [ ] Email abre cliente de email
- [ ] Lista de projetos com link PAD funcional
- [ ] Side card fecha ao clicar fora ou X
- [ ] Aba CRM carrega interface do CRM Execution
- [ ] Filtros do CRM funcionam