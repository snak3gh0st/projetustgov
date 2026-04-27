---
status: partial
phase: 22-csm-rbac-foundation
source: [22-VERIFICATION.md]
started: 2026-04-27T16:00:00Z
updated: 2026-04-27T16:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Confirm bruno@projetus.org DB role
expected: SELECT returns one row with role='csm' and active=true
result: [pending]

### 2. Anonymous navigation to /csm redirects to /login
expected: curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/csm returns 307
result: [pending]

### 3. CSM session navigating to /csm renders placeholder dashboard (HTTP 200)
expected: Browser or curl with bruno session cookie returns 200 and 'Clientes CSM' h1
result: [pending]

### 4. Vendedor session navigating to /csm is redirected to /sem-permissao
expected: curl with vendedor session cookie returns 307 to /sem-permissao
result: [pending]

### 5. POST /api/csm/clients creates vendedor_projetos row
expected: HTTP 201; DB row with vendedor_id = bruno's UUID
result: [pending]

### 6. PATCH /api/csm/clients/[cnpj]/contacts with status_contato returns 400
expected: HTTP 400 'No updatable fields supplied'
result: [pending]

### 7. GET /api/csm/comissoes payload isolation
expected: Response keys = [filters_applied, leads, role, summary] only — no paulo_breakdown, per_vendedor, etc.
result: [pending]

### 8. /csm/comissoes page accessible for CSM; redirects vendedor to /sem-permissao
expected: CSM: 200; vendedor: 307 to /sem-permissao
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
