import { auth } from '@/auth.config'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes that don't need auth
  const publicPaths = ['/login', '/api/auth', '/api/health', '/api/migrate']
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

  if (role === 'adm_produto') {
    if (isCrmPage || isCrmHome) {
      return Response.redirect(new URL('/tgov', req.url))
    }
    if (isCrmApi) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
