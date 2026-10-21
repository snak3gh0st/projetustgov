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
