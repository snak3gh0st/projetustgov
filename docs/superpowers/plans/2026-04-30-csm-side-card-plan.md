# CSM Side Card + CRM Interno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar side card ao CSM com dados do cliente (telefone, WhatsApp clicável, email, contatos, projetos com link PAD) + seção de CRM interno com mesma interface do CRM Execution.

**Architecture:** 
- Side card como componente React separada (slide-over) que recebe CNPJ do cliente clicado
- Nova aba no CSM que reutiliza componente do CRM Execution
- APIs existentes (contacts, projects) fornecem dados

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS

---

## Arquitetura de Arquivos

| Arquivo | Responsabilidade |
|--------|---------------|
| `web/src/components/CsmSideCard.tsx` | Componente de slide-over com dados do cliente |
| `web/src/app/csm/CsmDashboardClient.tsx` | Modificar para abrir side card no click |
| `web/src/app/csm/page.tsx` | Adicionar navegação de abas + CRM |
| `web/src/app/api/csm/client-details/route.ts` | NOVO: endpoint que agrega contacts + projects + location |

---

## Tasks

### Task 1: Criar API de detalhes do cliente CSM

**Files:**
- Create: `web/src/app/api/csm/client-details/route.ts`

**Context:** Agregar contacts + projects + location em um único endpoint para o side card.

- [ ] **Step 1: Criar endpoint**

```typescript
// web/src/app/api/csm/client-details/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canCsm } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canCsm(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cnpj = decodeURIComponent(params.cnpj).replace(/\D/g, '')
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: 'CNPJ must contain 14 digits' }, { status: 400 })
  }

  try {
    // Contacts
    const contacts = await query(`
      SELECT id, nome_pessoa, cargo, telefone, email, telefone_status, principal
      FROM lead_contacts
      WHERE lead_cnpj = $1
      ORDER BY principal DESC, created_at ASC
    `, [cnpj])

    // Projects
    const execList = ['102069', '102070', '102071', '102072', '103499', '103500', '103501', '103502', '103818', '103819', '103820', '103821'] // TODO: usar EXECUCAO_NR_PROPOSTAS
    const aprList = ['102073', '102074', '102075', '103503'] // TODO: usar APROVACAO_NR_PROPOSTAS

    const projects = await query(`
      SELECT nr_convenio as identifier, nr_proposta, objeto, situacao, uf, municipio
      FROM projetos_execucao
      WHERE cnpj = $1 AND nr_proposta = ANY($2::text[])
      UNION ALL
      SELECT nr_convenio, nr_proposta, objeto, situacao, uf, municipio
      FROM tgov_projetos_execucao
      WHERE cnpj = $1 AND nr_proposta = ANY($2::text[])
        AND NOT EXISTS (SELECT 1 FROM projetos_execucao WHERE nr_convenio = tgov_projetos_execucao.nr_convenio)
      ORDER BY identifier
    `, [cnpj, execList])

    // Location (from any project)
    const locationRow = projects.rows[0] || {}
    
    return NextResponse.json({
      cnpj,
      contacts: contacts.rows.map(c => ({
        id: c.id,
        nome_pessoa: c.nome_pessoa,
        cargo: c.cargo,
        telefone: c.telefone,
        email: c.email,
        telefone_status: c.telefone_status,
        principal: c.principal,
      })),
      projects: projects.rows.map(p => ({
        identifier: p.identifier,
        nr_proposta: p.nr_proposta,
        objeto: p.objeto,
        situacao: p.situacao,
        uf: p.uf,
        municipio: p.municipio,
      })),
      location: {
        uf: locationRow.uf,
        municipio: locationRow.municipio,
      }
    })
  } catch (error) {
    console.error('[api/csm/client-details] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch client details' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Testar endpoint**

Run: `curl -H "Cookie: ..." http://localhost:3000/api/csm/client-details/12345678901234`
Expected: JSON com contacts, projects, location

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/csm/client-details/route.ts
git commit -m "feat(csm): add client-details API endpoint for side card"
```

---

### Task 2: Criar componente CsmSideCard

**Files:**
- Create: `web/src/components/CsmSideCard.tsx`

**Context:** Slide-over que exibe dados do cliente. Reutilizar padrões existentes de slide-over (LeadSlideOver, ExecucaoSlideOver).

- [ ] **Step 1: Criar componente**

```typescript
// web/src/components/CsmSideCard.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { formatCNPJ } from '@/lib/format'

type Contact = {
  id: number
  nome_pessoa: string | null
  cargo: string | null
  telefone: string | null
  email: string | null
  telefone_status: string | null
  principal: boolean
}

type Project = {
  identifier: string
  nr_proposta: string
  objeto: string | null
  situacao: string | null
  uf: string | null
  municipio: string | null
}

type ClientDetails = {
  cnpj: string
  contacts: Contact[]
  projects: Project[]
  location: { uf: string | null; municipio: string | null }
}

const getPadUrl = (nrConvenio: string) =>
  `https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarProposta/ResultadoDaConsultaDeConvenioSelecionarConvenio.do?idConvenio=${nrConvenio}&destino=`

function getPhoneDigits(phone: string | null): string {
  return phone ? phone.replace(/\D/g, '') : ''
}

export default function CsmSideCard({
  cnpj,
  onClose,
}: {
  cnpj: string
  onClose: () => void
}) {
  const [data, setData] = useState<ClientDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/csm/client-details/${cnpj}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setError('Erro ao carregar dados')
        setLoading(false)
      })
  }, [cnpj])

  const mainContact = data?.contacts.find(c => c.principal) || data?.contacts[0]
  const phoneDigits = getPhoneDigits(mainContact?.telefone || null)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      
      {/* Card */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full max-h-[calc(100vh-2rem] overflow-hidden rounded-l-lg my-4 mr-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Cliente</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <span>Carregando...</span>
            </div>
          ) : error ? (
            <div className="text-red-600 text-sm">{error}</div>
          ) : data ? (
            <div className="space-y-4">
              {/* CNPJ */}
              <div>
                <div className="text-sm font-medium text-gray-500">CNPJ</div>
                <div className="text-gray-800 font-mono">{formatCNPJ(data.cnpj)}</div>
              </div>

              {/* Contato Principal */}
              {mainContact && (mainContact.nome_pessoa || mainContact.cargo) && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">CONTATO PRINCIPAL</div>
                  <div className="text-gray-800">
                    {mainContact.nome_pessoa}
                    {mainContact.cargo && <span className="text-gray-500"> - {mainContact.cargo}</span>}
                  </div>
                </div>
              )}

              {/* Contatos */}
              {data.contacts.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">CONTATOS</div>
                  <div className="space-y-1">
                    {data.contacts.map(c => (
                      <div key={c.id} className="text-sm">
                        {c.principal && '☑ '}
                        {c.nome_pessoa || 'Sem nome'}
                        {c.telefone && (
                          <span className="text-gray-500"> ({c.telefone})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Telefone / WhatsApp */}
              {mainContact?.telefone && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">TELEFONE / WHATSAPP</div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`tel:${mainContact.telefone}`}
                      className="inline-flex items-center gap-1 text-gray-800 hover:text-blue-600"
                    >
                      📱 {mainContact.telefone}
                    </a>
                    {phoneDigits && (
                      <a
                        href={`https://wa.me/55${phoneDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-green-600 hover:text-green-700"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Email */}
              {mainContact?.email && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">EMAIL</div>
                  <a
                    href={`mailto:${mainContact.email}`}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    {mainContact.email}
                  </a>
                </div>
              )}

              {/* Localização */}
              {data.location.uf || data.location.municipio && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">LOCALIZAÇÃO</div>
                  <div className="text-gray-800">
                    {data.location.municipio}
                    {data.location.uf && ` / ${data.location.uf}`}
                  </div>
                </div>
              )}

              {/* Projetos */}
              {data.projects.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">PROJETOS</div>
                  <div className="space-y-2">
                    {data.projects.map(p => (
                      <div key={p.identifier} className="bg-gray-50 rounded p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono text-gray-700">{p.identifier}</span>
                          <a
                            href={getPadUrl(p.identifier)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-700"
                          >
                            [PAD]
                          </a>
                        </div>
                        {p.objeto && (
                          <div className="text-xs text-gray-600 truncate">{p.objeto}</div>
                        )}
                        {p.situacao && (
                          <div className="text-xs text-gray-500">Situação: {p.situacao}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/CsmSideCard.tsx
git commit -m "feat(csm): add CsmSideCard component"
```

---

### Task 3: Integrar side card no CsmDashboardClient

**Files:**
- Modify: `web/src/app/csm/CsmDashboardClient.tsx`

- [ ] **Step 1: Importar CsmSideCard e adicionar estado**

Adicionar no topo do arquivo:
```typescript
import CsmSideCard from '@/components/CsmSideCard'
```

Adicionar estado:
```typescript
const [selectedClient, setSelectedClient] = useState<string | null>(null)
```

- [ ] **Step 2: Adicionar click handler na linha**

Modificar o `onClick` da linha do cliente para abrir side card:
```typescript
onClick={() => {
  toggleExpand(c.cnpj)
  setSelectedClient(c.cnpj)
}}
```

Modificar o td para click separado (se necessário):
- Adicionar um botão de "info" ou detectar qual clique
- Alternativa: click na coluna do nome abre side card

- [ ] **Step 3: Renderizar CsmSideCard**

Ao final do JSX, depois do fechamento da tabela:
```tsx
{selectedClient && (
  <CsmSideCard
    cnpj={selectedClient}
    onClose={() => setSelectedClient(null)}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/csm/CsmDashboardClient.tsx
git commit -m "feat(csm): integrate side card on client click"
```

---

### Task 4: Adicionar navegação de abas no CSM

**Files:**
- Modify: `web/src/app/csm/page.tsx`

- [ ] **Step 1: Ver estrutura atual**

Read: `web/src/app/csm/page.tsx`

- [ ] **Step 2: Adicionar tabs**

Adicionar navegação com abas: Dashboard, Projetos, CRM, Comissões

- [ ] **Step 3: Commit**

```bash
git add web/src/app/csm/page.tsx
git commit -m "feat(csm): add tab navigation"
```

---

### Task 5:Adicionar aba CRM

**Files:**
- Modify: `web/src/app/csm/page.tsx` (continuação)

- [ ] **Step 1: Importar componente CRM**

Verificar se existe CrmDashboardClient ou similar em `/crm/` ou `/execucao/`

- [ ] **Step 2: Renderizar CRM na aba**

Passar filtro por CNPJs do portfólio CSM (obter lista do endpoint portfolio)

- [ ] **Step 3: Commit**

```bash
git add web/src/app/csm/page.tsx
git commit -m "feat(csm): add CRM tab"
```

---

## Execução

**Opção 1: Subagent-Driven (recomendado)**
- Dispatch um subagent por task
- Revisão entre tasks

**Opção 2: Inline Execution**
- Executar tasks inline com checkpoints

**Qual abordagem prefere?**