import { CRM_STATUS_ALIASES } from './crm-catalog'

// Status comercial por CNPJ nas abas de Execução e Prestação de Contas.
// A lista /execucao e o funil da tela inicial usam as mesmas regras, para o
// número de cada card do funil bater com as linhas da lista.

export const normalizedStatusSql = (columnRef: string) => `
  CASE
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Nao Contatado', 'Não Contatado', 'Novo', 'Contactado') THEN 'Não Contatado'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Ainda Não', 'Sem Interesse') THEN 'Sem Interesse'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Retorno', 'Em Atendimento') THEN 'Em Atendimento'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Contatado') THEN 'Contatado'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Reunião Agendada', 'Reuniao Agendada') THEN 'Reunião Agendada'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Proposta', 'Proposta Enviada') THEN 'Proposta Enviada'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Aguardando Closer', 'Em Aprovação') THEN 'Em Aprovação'
    WHEN COALESCE(${columnRef}, 'Não Contatado') IN ('Impedimento Técnico', 'Impedimento Tecnico') THEN 'Impedimento Técnico'
    WHEN COALESCE(${columnRef}, 'Não Contatado') = 'Cancelado' THEN 'Cancelado'
    ELSE COALESCE(${columnRef}, 'Não Contatado')
  END
`

export const normalizedStatusOrderSql = (normalizedExpr: string) => `
  CASE ${normalizedExpr}
    WHEN 'Fechado' THEN 1
    WHEN 'Em Aprovação' THEN 2
    WHEN 'Proposta Enviada' THEN 3
    WHEN 'Reunião Agendada' THEN 4
    WHEN 'Contatado' THEN 5
    WHEN 'Em Atendimento' THEN 6
    WHEN 'Sem Interesse' THEN 7
    WHEN 'Impedimento Técnico' THEN 8
    WHEN 'Cancelado' THEN 9
    WHEN 'Quente' THEN 10
    WHEN 'Muito Quente' THEN 11
    WHEN 'Telefone Invalido' THEN 12
    WHEN 'Não Contatado' THEN 14
    ELSE 13
  END
`

const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`

// normalizeCrmStatus em SQL: a lista aplica essa normalização no cliente.
export const crmAliasSql = (expr: string) => `
  CASE ${expr}
    ${Object.entries(CRM_STATUS_ALIASES).map(([from, to]) => `WHEN ${sqlLiteral(from)} THEN ${sqlLiteral(to)}`).join('\n    ')}
    ELSE ${expr}
  END
`
