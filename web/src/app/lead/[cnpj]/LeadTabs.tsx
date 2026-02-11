'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Emenda, Proposta, Ministerio, Programa, Instrument } from '@/lib/types'

const TABS = [
  { id: 'instruments', label: 'Instrumentos' },
  { id: 'emendas', label: 'Emendas' },
  { id: 'propostas', label: 'Propostas' },
  { id: 'ministerios', label: 'Ministerios & Programas' },
] as const

type TabId = typeof TABS[number]['id']

interface Props {
  emendas: Emenda[]
  propostas: Proposta[]
  ministerios: Ministerio[]
  programas: Programa[]
  instruments: Instrument[]
}

export default function LeadTabs({ emendas, propostas, ministerios, programas, instruments }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('instruments')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-white/10 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-sigma-neon'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sigma-neon" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'instruments' && <InstrumentsTab data={instruments} />}
      {activeTab === 'emendas' && <EmendasTab data={emendas} />}
      {activeTab === 'propostas' && <PropostasTab data={propostas} />}
      {activeTab === 'ministerios' && (
        <MinisteriosTab ministerios={ministerios} programas={programas} />
      )}
    </div>
  )
}

function InstrumentsTab({ data }: { data: Instrument[] }) {
  if (data.length === 0) return <Empty label="instrumentos" />
  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 bg-sigma-navy-light">
            <th className="px-4 py-3 text-left text-xs text-gray-400">Nr Instrumento</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Situacao</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Ativo</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Emenda</th>
            <th className="px-4 py-3 text-right text-xs text-gray-400">Valor Global</th>
            <th className="px-4 py-3 text-right text-xs text-gray-400">Empenhado</th>
            <th className="px-4 py-3 text-right text-xs text-gray-400">Liberado</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Vigencia</th>
          </tr>
        </thead>
        <tbody>
          {data.map((inst, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-3 font-mono text-xs text-gray-300">{inst.nr_instrumento}</td>
              <td className="px-4 py-3 text-gray-300">{inst.situacao || '-'}</td>
              <td className="px-4 py-3">
                <span className={inst.instrumento_ativo === 'SIM' ? 'text-emerald-400' : 'text-gray-500'}>
                  {inst.instrumento_ativo || '-'}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={inst.tem_emenda === 'SIM' ? 'text-sigma-neon' : 'text-gray-500'}>
                  {inst.tem_emenda}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(inst.valor_global)}</td>
              <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(inst.valor_empenhado)}</td>
              <td className="px-4 py-3 text-right text-sigma-neon">{formatCurrency(inst.valor_liberado)}</td>
              <td className="px-4 py-3 text-xs text-gray-400">
                {formatDate(inst.data_inicio_vigencia)} - {formatDate(inst.data_fim_vigencia)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmendasTab({ data }: { data: Emenda[] }) {
  if (data.length === 0) return <Empty label="emendas" />
  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 bg-sigma-navy-light">
            <th className="px-4 py-3 text-left text-xs text-gray-400">Numero</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Parlamentar</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Tipo</th>
            <th className="px-4 py-3 text-right text-xs text-gray-400">Valor</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Ministerio</th>
          </tr>
        </thead>
        <tbody>
          {data.map((emenda, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-3 font-mono text-xs text-gray-300">{emenda.numero_emenda || '-'}</td>
              <td className="px-4 py-3 text-gray-300">{emenda.parlamentar || '-'}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">{emenda.tipo_emenda || '-'}</td>
              <td className="px-4 py-3 text-right text-sigma-neon">{formatCurrency(emenda.valor_emenda)}</td>
              <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[200px]">
                {emenda.ministerio || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PropostasTab({ data }: { data: Proposta[] }) {
  if (data.length === 0) return <Empty label="propostas" />
  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 bg-sigma-navy-light">
            <th className="px-4 py-3 text-left text-xs text-gray-400">ID</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Titulo</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Situacao</th>
            <th className="px-4 py-3 text-right text-xs text-gray-400">Valor Global</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Programa</th>
            <th className="px-4 py-3 text-left text-xs text-gray-400">Publicacao</th>
          </tr>
        </thead>
        <tbody>
          {data.map((prop, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-3 font-mono text-xs text-gray-300">{prop.transfer_gov_id}</td>
              <td className="px-4 py-3 text-gray-300 truncate max-w-[250px]">{prop.titulo || '-'}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">{prop.situacao || '-'}</td>
              <td className="px-4 py-3 text-right text-sigma-neon">{formatCurrency(prop.valor_global)}</td>
              <td className="px-4 py-3 text-gray-400 text-xs truncate max-w-[180px]">
                {prop.programa_nome || '-'}
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(prop.data_publicacao)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MinisteriosTab({
  ministerios,
  programas,
}: {
  ministerios: Ministerio[]
  programas: Programa[]
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h3 className="font-heading text-sm font-semibold text-white mb-3">Ministerios</h3>
        {ministerios.length === 0 ? (
          <Empty label="ministerios" />
        ) : (
          <div className="space-y-2">
            {ministerios.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-sigma-navy-card border border-white/5 rounded-lg p-3"
              >
                <span className="text-sm text-gray-300 truncate max-w-[250px]">{m.orgao}</span>
                <span className="text-xs text-sigma-neon font-mono">{m.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="font-heading text-sm font-semibold text-white mb-3">Programas</h3>
        {programas.length === 0 ? (
          <Empty label="programas" />
        ) : (
          <div className="space-y-2">
            {programas.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-sigma-navy-card border border-white/5 rounded-lg p-3"
              >
                <span className="text-sm text-gray-300 truncate max-w-[250px]">{p.programa_nome}</span>
                <span className="text-xs text-sigma-neon font-mono">{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-gray-500 text-sm">
      Nenhum(a) {label} encontrado(a)
    </div>
  )
}
