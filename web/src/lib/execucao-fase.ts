// Fase do convênio no TransfereGov (projetos_execucao.situacao) para as abas
// comerciais de Execução e Prestação de Contas. As duas fases compartilham o
// status comercial (vendedor_projetos.status_contato_execucao): são vendidas juntas.

export type ExecucaoFase = 'execucao' | 'prestacao_contas'

export function parseExecucaoFase(value: string | null | undefined): ExecucaoFase | null {
  return value === 'execucao' || value === 'prestacao_contas' ? value : null
}

export function execucaoFaseSql(fase: ExecucaoFase, alias = 'pe'): string {
  return fase === 'execucao'
    ? `LOWER(${alias}.situacao) = 'em execução'`
    : `${alias}.situacao ILIKE '%presta%contas%'`
}
