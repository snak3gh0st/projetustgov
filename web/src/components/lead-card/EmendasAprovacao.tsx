'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { StatusSelect } from '@/components/leads/list-ui'
import { formatCurrency, parseCurrencyInput } from '@/lib/format'
import {
  CRM_STATUS_SELECT_OPTIONS,
  formatCrmStatusLabel,
  isManagementCrmStatus,
  normalizeCrmStatus,
} from '@/lib/crm-catalog'
import { canReopenClosedSale, hasTeamCommercialView } from '@/lib/roles'
import type { VendedorProjeto } from '@/lib/types'

interface EmendasAprovacaoProps {
  projetos: VendedorProjeto[]
  userRole: string | null
  canModify: boolean
  onStatus: (id: number, value: string) => void
  onObservacao: (id: number, value: string) => void
  onContrato: (id: number, value: boolean) => void
  onAutorizar: (projeto: VendedorProjeto) => void
  onValorContrato: (id: number, valor: number) => void
}

const pct = (v: number | null | undefined) => `${Number(v || 0).toFixed(1).replace('.', ',')}%`

function Comissao({ p }: { p: VendedorProjeto }) {
  // A API já esconde o que o papel não pode ver; aqui só mostra o que chegou.
  const consultor = Number(p.comissao_valor) || 0
  const gestor = Number(p.closer_comissao_valor) || 0
  if (consultor <= 0 && gestor <= 0) return null
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-raised/70 px-3 py-2.5 text-xs">
      {p.valor_venda != null && (
        <div><dt className="text-ink-3">Venda</dt><dd className="font-medium tabular-nums text-ink">{formatCurrency(Number(p.valor_venda))}</dd></div>
      )}
      {consultor > 0 && (
        <div>
          <dt className="text-ink-3">Consultor ({pct(p.comissao_percentual)})</dt>
          <dd className="font-semibold tabular-nums text-accent-ink">{formatCurrency(consultor)}</dd>
        </div>
      )}
      {gestor > 0 && (
        <div>
          <dt className="text-ink-3">Gestor ({pct(p.closer_comissao_percentual)})</dt>
          <dd className="font-medium tabular-nums text-ink">{formatCurrency(gestor)}{p.closer_nome ? <span className="font-normal text-ink-3"> · {p.closer_nome}</span> : null}</dd>
        </div>
      )}
      {Number(p.comissao_bonus) > 0 && (
        <div><dt className="text-ink-3">Fundo comercial</dt><dd className="font-medium tabular-nums text-ink">{formatCurrency(Number(p.comissao_bonus))}</dd></div>
      )}
    </dl>
  )
}

// Venda fechada sem valor (vendas antigas): o gestor informa o valor do contrato,
// que aparece no card da proposta no TGov. Não recalcula comissão.
function ValorContratoPendente({ p, canFill, onSave }: { p: VendedorProjeto; canFill: boolean; onSave: (id: number, valor: number) => void }) {
  const [valorStr, setValorStr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const box = 'rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/25'
  if (!canFill) return <p className={box}>Venda fechada sem valor do contrato. O gestor precisa informar.</p>

  function save() {
    const valor = parseCurrencyInput(valorStr)
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Informe um valor maior que zero')
      return
    }
    setError(null)
    onSave(p.id, valor)
  }

  return (
    <div className={`${box} space-y-2`}>
      <p className="font-medium">Venda fechada sem valor do contrato</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={valorStr}
          onChange={(e) => setValorStr(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          placeholder="R$ 0,00"
          aria-label={`Valor do contrato da emenda ${p.nr_emenda || p.id}`}
          className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs tabular-nums text-ink focus:outline-none focus:ring-1 focus:ring-accent dark:border-amber-500/40 dark:bg-transparent"
        />
        <Button size="sm" variant="primary" onClick={save}>Salvar valor</Button>
      </div>
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

// Emendas do CNPJ no funil de Aprovação: cada uma com o próprio status e o próprio fluxo de venda.
export default function EmendasAprovacao({
  projetos,
  userRole,
  canModify,
  onStatus,
  onObservacao,
  onContrato,
  onAutorizar,
  onValorContrato,
}: EmendasAprovacaoProps) {
  const role = userRole ?? ''
  const isSellerRole = role === 'vendedor' || role === 'coordenador'
  const options = isSellerRole ? CRM_STATUS_SELECT_OPTIONS.filter((s) => !isManagementCrmStatus(s)) : CRM_STATUS_SELECT_OPTIONS
  const isGestao = hasTeamCommercialView(role)
  const showOwner = new Set(projetos.map((p) => p.vendedor_nome ?? '')).size > 1

  return (
    <ul className="divide-y divide-line">
      {projetos.map((p) => {
        const status = normalizeCrmStatus(p.status_contato)
        const locked = !canModify || (status === 'Fechado' && !canReopenClosedSale(role))
        const emAprovacao = status === 'Em Aprovação'
        return (
          <li key={p.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums text-ink">{formatCurrency(Number(p.valor_emenda) || 0)}</p>
                <p className="mt-0.5 text-xs text-ink-2 [overflow-wrap:anywhere]">{p.parlamentar || 'Parlamentar não informado'}</p>
                {p.orgao_concedente && <p className="text-xs text-ink-3 [overflow-wrap:anywhere]">{p.orgao_concedente}</p>}
                {showOwner && <p className="mt-0.5 text-xs text-ink-3">Responsável: {p.vendedor_nome || 'Sem dono'}</p>}
              </div>
              <StatusSelect
                ariaLabel={`Status da emenda ${p.nr_emenda || p.id}`}
                status={status}
                label={formatCrmStatusLabel(p.status_contato, p.venda_etapa)}
                options={options}
                disabled={locked}
                onChange={(value) => onStatus(p.id, value)}
              />
            </div>

            {emAprovacao && (
              <div className="rounded-lg bg-violet-50 px-3 py-2.5 text-xs text-violet-900 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-500/25">
                {isGestao && canModify ? (
                  <div className="space-y-2">
                    <label className="flex cursor-pointer select-none items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={!!p.contrato_assinado}
                        onChange={(e) => onContrato(p.id, e.target.checked)}
                        className="h-4 w-4 rounded border-line-strong accent-accent"
                      />
                      Contrato assinado
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!p.contrato_assinado}
                        title={!p.contrato_assinado ? 'Confirme o contrato assinado antes de autorizar' : undefined}
                        onClick={() => onAutorizar(p)}
                      >
                        Autorizar fechamento
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onStatus(p.id, 'Proposta Enviada')}>
                        Voltar para Proposta
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p>Aguardando conferência do gestor para concluir a venda.</p>
                )}
                {Number(p.valor_venda) > 0 && (
                  <p className="mt-1.5 text-violet-700 dark:text-violet-300">
                    Valor estimado {formatCurrency(Number(p.valor_venda))}{p.tipo_servico ? ` · ${p.tipo_servico}` : ''}
                  </p>
                )}
              </div>
            )}

            {status === 'Fechado' && !(Number(p.valor_venda) > 0) && (
              <ValorContratoPendente p={p} canFill={isGestao && canModify} onSave={onValorContrato} />
            )}

            <Comissao p={p} />

            <div className="flex items-center gap-3">
              <input
                type="text"
                aria-label={`Observação da emenda ${p.nr_emenda || p.id}`}
                defaultValue={p.observacoes || ''}
                placeholder={canModify ? 'Observação' : 'Sem observação'}
                readOnly={!canModify}
                onBlur={(e) => { if (e.target.value !== (p.observacoes || '')) onObservacao(p.id, e.target.value) }}
                className="min-w-0 flex-1 border-b border-transparent bg-transparent py-0.5 text-xs text-ink-2 placeholder:text-ink-3 hover:border-line focus:border-accent focus:outline-none read-only:hover:border-transparent"
              />
              {p.link_externo && (
                <a href={p.link_externo} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-medium text-accent-ink hover:underline">
                  Abrir emenda
                </a>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
