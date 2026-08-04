import { auth } from '@/auth.config'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes that don't need auth
  // Conta Azul OAuth callback is public: state is HMAC-signed and carries userId.
  const publicPaths = [
    '/login',
    '/api/auth',
    '/api/health',
    '/api/migrate',
    '/api/cron',
    '/api/integrations/conta-azul/callback',
  ]
  const isPublic = publicPaths.some(path => pathname.startsWith(path))

  if (isPublic) {
    return
  }

  // Check if user is authenticated
  if (!req.auth) {
    // No session - redirect to login or return 401 for API routes
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.redirect(new URL('/login', req.url))
  }

  // Has session - redirect away from login if trying to access it
  if (pathname.startsWith('/login')) {
    return Response.redirect(new URL('/', req.url))
  }

  // Role-based area isolation
  // adm_produto = TGov-only (cannot access CRM areas)
  // vendedor / coordenador / visualizador = CRM-only (cannot access TGov)
  const role = (req.auth?.user as { role?: string } | undefined)?.role

  // TGov-only paths (page + API)
  const TGOV_PATHS = ['/tgov', '/api/tgov']
  const isTGovPath = TGOV_PATHS.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))

  // CRM page paths that adm_produto must not access
  const CRM_PAGE_PATHS = ['/leads', '/comissoes', '/bi', '/distribuir', '/monitoramento', '/monitorar', '/execucao']
  const isCrmPage = CRM_PAGE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isCrmHome = pathname === '/'

  // CRM-only API paths that adm_produto must not access
  const isCrmApi = pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/tgov') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/usuarios') &&
    !pathname.startsWith('/api/health')

  // CSM-area paths (page + API). Must be allowed through for csm role even
  // though /api/csm/* would otherwise match isCrmApi.
  const CSM_PATHS = ['/csm', '/api/csm']
  const isCsmPath = CSM_PATHS.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))

  if (role === 'adm_produto') {
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/tgov', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (role === 'csm') {
    // CSM-area paths take precedence — never block /csm or /api/csm for the csm role.
    if (isCsmPath) {
      return
    }
    // CSM is otherwise TGov-read + CSM-area only — CRM pages and CRM APIs are blocked.
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/csm', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Mutation gate: CSM só pode escrever em /api/tgov/comments. Tudo mais bloqueado em TGov.
    const isTgovPrivilegedMutation =
      pathname.startsWith('/api/tgov/whitelist') ||
      pathname.startsWith('/api/tgov/interaction') ||
      pathname.startsWith('/api/tgov/tecnico')
    if (isTgovPrivilegedMutation && req.method !== 'GET') {
      return Response.json({ error: 'Forbidden: CSM is read-only on this resource' }, { status: 403 })
    }
  }

  if (role === 'coord_aprovacao') {
    // coord_aprovacao é TGov-only (somente aprovação).
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/tgov', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (role === 'assistente_aprovacao') {
    // assistente_aprovacao é TGov-only (somente aprovação).
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/tgov', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (role === 'projetista') {
    // projetista é TGov-only (somente aprovação, somente propostas atribuídas).
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/tgov', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Projetista só pode escrever em /api/tgov/comments. Tudo mais bloqueado.
    const isTgovPrivilegedMutation =
      pathname.startsWith('/api/tgov/whitelist') ||
      pathname.startsWith('/api/tgov/interaction') ||
      pathname.startsWith('/api/tgov/tecnico')
    if (isTgovPrivilegedMutation && req.method !== 'GET') {
      return Response.json({ error: 'Forbidden: projetista is read-only on this resource' }, { status: 403 })
    }
  }

  if (role === 'coord_execucao' || role === 'assistente_execucao') {
    // Perfis de execução são TGov-only (somente a aba execucao).
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/tgov', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (role === 'coord_prestacao' || role === 'assistente_prestacao') {
    // Perfis de prestação de contas são TGov-only (somente a aba prestacao_contas).
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/tgov', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  if (role === 'gestor_financeiro') {
    const FINANCE_PATHS = [
      '/admin/conta-azul',
      '/api/integrations/conta-azul',
      '/comissoes',
      '/api/comissoes',
      '/bi',
      '/api/bi',
      '/api/fundo-comercial',
      '/api/commission-config',
      '/sem-permissao',
    ]
    const isFinancePath = FINANCE_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')
    )
    if (pathname === '/' || isCrmHome) {
      return Response.redirect(new URL('/admin/conta-azul', req.url))
    }
    if (!isFinancePath) {
      if (pathname.startsWith('/api/')) {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
      return Response.redirect(new URL('/admin/conta-azul', req.url))
    }
  }

  // vendedor / coordenador / visualizador cannot access TGov
  if (role && ['vendedor', 'coordenador', 'visualizador'].includes(role) && isTGovPath) {
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    return Response.redirect(new URL('/sem-permissao', req.url))
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)']
}
