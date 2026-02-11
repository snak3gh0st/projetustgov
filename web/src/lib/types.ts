export interface VendedorProjeto {
  id: number
  vendedor_id: string | null
  // Programa
  codigo_programa: string | null
  nome_programa: string | null
  link_externo: string | null
  orgao_concedente: string | null
  uf: string | null
  municipio: string | null
  qualificacao: string | null
  nr_emenda: string | null
  parlamentar: string | null
  // Beneficiario
  cnpj: string
  nome: string
  natureza_juridica: string | null
  // Financeiro
  valor_emenda: number | null
  valor_global: number | null
  valor_empenhado: number | null
  valor_liberado: number | null
  // Siconv extras
  nr_convenio: string | null
  objeto: string | null
  modalidade: string | null
  situacao: string | null
  saldo_conta: number | null
  // CRM
  telefone: string | null
  email: string | null
  status_contato: string
  observacoes: string | null
  // Metadata
  importado_de: string | null
  created_at: string
  updated_at: string
  vendedor_nome?: string | null
}

// Client grouped by CNPJ
export interface ClienteAgrupado {
  cnpj: string
  nome: string
  email: string
  telefone: string
  uf: string
  municipio: string
  projetos: VendedorProjeto[]
  totalProjetos: number
  valorGlobal: number
}

export interface DashboardStats {
  total_clientes: number
  total_projetos: number
  volume_financeiro: number
  por_categoria: {
    Novo: number
    Contactado: number
    Proposta: number
    Retorno: number
  }
}

export interface CRMUser {
  id: string
  nome: string
  email: string
  role: 'gestor' | 'vendedor'
  active: boolean
}
