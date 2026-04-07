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
  endereco: string | null
  status_contato: string
  tipo_vendedor: 'SDR' | 'Closer' | 'Exclusivo' | null
  comissao_percentual: number | null
  comissao_valor: number | null
  comissao_bonus: number | null
  closer_id: string | null
  closer_comissao_percentual: number | null
  closer_comissao_valor: number | null
  valor_venda: number | null
  observacoes: string | null
  // Metadata
  importado_de: string | null
  created_at: string
  updated_at: string
  vendedor_nome?: string | null
  closer_nome?: string | null
  is_existing_client?: boolean
  is_max_priority?: boolean
  executed_count?: number | null
  emenda_count?: number
  total_valor_emendas?: number | null
  days_since_last_contact?: number | null
  principal_telefone_status?: 'valido' | 'invalido' | 'nao_atende' | 'desconhecido' | null
  comissao_locked?: boolean
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
  total_leads: number
  total_assigned: number
  total_unassigned: number
  total_valor_emenda: number
  by_status: {
    'Não Contatado': number
    Retorno: number
    Proposta: number
    'Aguardando Closer': number
    Fechado: number
  }
}

export type UserRole = 'gestor' | 'vendedor' | 'visualizador' | 'coordenador' | 'adm_produto'

export interface CRMUser {
  id: string
  nome: string
  email: string
  role: UserRole
  active: boolean
  created_at: string
  updated_at: string
}

export interface ExistingClient {
  id: number
  cnpj: string
  nome: string | null
  added_by: string | null
  notes: string | null
  created_at: string
}

export interface ContactNote {
  id: string
  lead_cnpj: string
  vendedor_id: string
  vendedor_nome?: string
  tipo: 'ligacao' | 'email' | 'whatsapp' | 'reuniao' | 'outro'
  observacao: string | null
  created_at: string
  updated_at: string
}

export type TelefoneStatus = 'valido' | 'invalido' | 'nao_atende' | 'desconhecido'

export interface LeadContact {
  id: number
  lead_cnpj: string
  nome_pessoa: string | null
  cargo: string | null
  telefone: string | null
  email: string | null
  telefone_status: TelefoneStatus
  principal: boolean
  created_by: string | null
  created_by_nome?: string | null
  created_at: string
}
