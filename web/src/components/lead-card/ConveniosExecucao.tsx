'use client'

import { StatusSelect, Tag } from '@/components/leads/list-ui'
import { formatCurrency } from '@/lib/format'
import { CRM_STATUS_SELECT_OPTIONS, formatCrmStatusLabel } from '@/lib/crm-catalog'
import { faseDaSituacao } from '@/lib/lead-timeline'

export interface ConvenioRow {
  nr_convenio: string
  situacao: string | null
  objeto: string | null
  valor_global: string | number | null
  pct_execucao: string | number | null
}

interface ConveniosExecucaoProps {
  convenios: ConvenioRow[]
  /** Status comercial de Execução/Prestação do CNPJ (um só para todos os convênios). */
  status: string
  /** null: o CNPJ não tem linha no CRM, então não há onde gravar o status. */
  onStatus: ((value: string) => void) | null
  canChange: boolean
}

// Convênios do CNPJ em Execução e Prestação de Contas: status comercial por CNPJ, como na lista.
export default function ConveniosExecucao({ convenios, status, onStatus, canChange }: ConveniosExecucaoProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="text-xs text-ink-3">Status comercial do CNPJ</span>
        {onStatus ? (
          <StatusSelect
            ariaLabel="Status de Execução e Prestação"
            status={status}
            label={formatCrmStatusLabel(status)}
            options={CRM_STATUS_SELECT_OPTIONS}
            disabled={!canChange}
            onChange={onStatus}
          />
        ) : (
          <span className="text-xs text-ink-3">Fora do CRM</span>
        )}
      </div>
      <ul className="divide-y divide-line">
        {convenios.map((c) => {
          const fase = faseDaSituacao(c.situacao)
          return (
            <li key={c.nr_convenio} className="space-y-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-ink-3">{c.nr_convenio}</span>
                {fase === 'execucao' && <Tag tone="teal">Execução</Tag>}
                {fase === 'prestacao_contas' && <Tag tone="violet">Prestação de Contas</Tag>}
                {!fase && c.situacao && <Tag tone="neutral">{c.situacao}</Tag>}
              </div>
              {c.objeto && <p className="line-clamp-2 text-xs text-ink-2" title={c.objeto}>{c.objeto}</p>}
              <div className="flex gap-4 text-xs text-ink-3">
                {c.valor_global != null && <span>Valor <strong className="font-medium tabular-nums text-ink">{formatCurrency(Number(c.valor_global))}</strong></span>}
                {c.pct_execucao != null && <span>Executado <strong className="font-medium tabular-nums text-ink">{Number(c.pct_execucao).toFixed(1).replace('.', ',')}%</strong></span>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
