'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import TierBadge from './TierBadge'
import { formatCNPJ, formatCompactCurrency } from '@/lib/format'
import { calculateValueTier } from '@/lib/tiers'
import type { Lead } from '@/lib/types'

const columnHelper = createColumnHelper<Lead>()

export default function LeadTable({ data }: { data: Lead[] }) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])

  const columns = useMemo(
    () => [
      columnHelper.accessor('cnpj', {
        header: 'CNPJ',
        cell: (info) => (
          <span className="font-mono text-xs">{formatCNPJ(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('nome', {
        header: 'Nome',
        cell: (info) => (
          <span className="text-white font-medium truncate max-w-[200px] block">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('estado', {
        header: 'UF',
        cell: (info) => info.getValue() || '-',
      }),
      columnHelper.display({
        id: 'tier',
        header: 'Tier',
        cell: ({ row }) => {
          const tier = calculateValueTier(
            row.original.total_propostas,
            row.original.valor_total_emendas,
            row.original.total_convenios
          )
          return <TierBadge tier={tier} />
        },
      }),
      columnHelper.accessor('total_convenios', {
        header: 'Instrumentos',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('valor_total_emendas', {
        header: 'Valor Emendas',
        cell: (info) => (
          <span className="text-sigma-neon">
            {formatCompactCurrency(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('email', {
        header: 'Contato',
        cell: (info) => {
          const email = info.getValue()
          const phone = info.row.original.telefone
          if (email) return <span className="text-xs truncate max-w-[150px] block">{email}</span>
          if (phone) return <span className="text-xs">{phone}</span>
          return <span className="text-gray-600">-</span>
        },
      }),
    ],
    []
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  function exportCSV() {
    const headers = ['CNPJ', 'Nome', 'UF', 'Propostas', 'Emendas', 'Valor Emendas', 'Instrumentos', 'Email', 'Telefone']
    const rows = data.map((l) => [
      l.cnpj,
      l.nome,
      l.estado || '',
      l.total_propostas,
      l.total_emendas,
      l.valor_total_emendas,
      l.total_convenios,
      l.email || '',
      l.telefone || '',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-white/5 bg-sigma-navy-light">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => router.push(`/lead/${encodeURIComponent(row.original.cnpj)}`)}
                className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-gray-300">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
        <span>{data.length} leads encontrados</span>
        <button
          onClick={exportCSV}
          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-xs"
        >
          Exportar CSV
        </button>
      </div>
    </div>
  )
}
