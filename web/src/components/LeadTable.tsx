'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { formatCNPJ, formatCompactCurrency } from '@/lib/format'
import type { VendedorProjeto } from '@/lib/types'

const columnHelper = createColumnHelper<VendedorProjeto>()

export default function LeadTable({ data }: { data: VendedorProjeto[] }) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([])

  const columns = useMemo(
    () => [
      columnHelper.accessor('cnpj', {
        header: 'CNPJ',
        cell: (info) => <span className="font-mono text-xs">{formatCNPJ(info.getValue())}</span>,
      }),
      columnHelper.accessor('nome', {
        header: 'Nome',
        cell: (info) => <span className="text-gray-900 font-medium truncate max-w-[200px] block">{info.getValue()}</span>,
      }),
      columnHelper.accessor('nome_programa', {
        header: 'Programa',
        cell: (info) => <span className="text-xs truncate max-w-[150px] block">{info.getValue() || '-'}</span>,
      }),
      columnHelper.accessor('valor_global', {
        header: 'Valor Global',
        cell: (info) => <span className="text-[#0072F7] text-xs">{formatCompactCurrency(info.getValue())}</span>,
      }),
      columnHelper.accessor('parlamentar', {
        header: 'Parlamentar',
        cell: (info) => <span className="text-xs">{info.getValue() || '-'}</span>,
      }),
      columnHelper.accessor('situacao', {
        header: 'Situacao',
        cell: (info) => <span className="text-xs">{info.getValue() || '-'}</span>,
      }),
      columnHelper.accessor('uf', {
        header: 'UF',
        cell: (info) => <span className="text-xs">{info.getValue() || '-'}</span>,
      }),
      columnHelper.accessor('status_contato', {
        header: 'Status',
        cell: (info) => info.getValue() || 'Não Contatado',
      }),
      columnHelper.accessor('vendedor_nome', {
        header: 'Vendedor',
        cell: (info) => info.getValue() || '-',
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
  })

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-gray-200 bg-gray-50">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800"
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
              className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 text-gray-600">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
