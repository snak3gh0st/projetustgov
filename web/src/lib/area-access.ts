// O gestor comercial fica só na área Comercial: fora dela, página redireciona e API responde 403.
const OUTSIDE_COMMERCIAL = [
  '/tgov', '/api/tgov',
  '/operacao', '/api/operacao',
  '/financeiro', '/api/financeiro',
  '/admin', '/api/integrations/conta-azul',
]

export function commercialOnlyBlock(role: string | undefined, pathname: string): 'redirect' | 'forbid' | null {
  if (role !== 'gestor') return null
  const blocked = OUTSIDE_COMMERCIAL.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!blocked) return null
  return pathname.startsWith('/api/') ? 'forbid' : 'redirect'
}

// O CSM acompanha a carteira em Execução e Prestação: lê a lista, o detalhe, contatos, notas e histórico, sem gravar.
const CSM_COMMERCIAL_READS = [
  /^\/api\/execucao$/,
  /^\/api\/execucao\/(?!distribute$|export$)[^/]+$/,
  /^\/api\/leads$/,
  /^\/api\/leads\/[^/]+\/(contacts|notes|historico)$/,
]

export function csmCanReadCommercial(pathname: string, method: string): boolean {
  return method === 'GET' && CSM_COMMERCIAL_READS.some((re) => re.test(pathname))
}
