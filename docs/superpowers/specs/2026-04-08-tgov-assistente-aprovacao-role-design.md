# Spec 1: Role `assistente_aprovacao` + Hierarquia de Gestão de Usuários

**Data:** 2026-04-08  
**Status:** Aprovado  
**Escopo:** Novo role intermediário entre `coord_aprovacao` e `projetista`, com config centralizada de hierarquia.

---

## Contexto

O sistema TGov já possui `coord_aprovacao` e `projetista`. Este spec adiciona `assistente_aprovacao` entre eles e centraliza a lógica de permissões de criação de usuários — hoje hardcoded em múltiplos endpoints — num objeto de configuração único em `dal.ts`.

**Princípio central:** tudo que funciona hoje continua funcionando. A config nova substitui os hardcodes sem mudar o comportamento do `adm_produto` ou dos roles existentes.

---

## Hierarquia Final

```
gestor / admin
  └── adm_produto          → cria: coord_aprovacao, assistente_aprovacao, projetista
        └── coord_aprovacao     → cria: assistente_aprovacao, projetista
              └── assistente_aprovacao → cria: projetista
                    └── projetista       → sem criação de usuários
```

---

## Arquitetura

### 1. Tipo de Role

**`web/src/types/next-auth.d.ts`** e **`web/src/lib/dal.ts`**  
Adicionar `'assistente_aprovacao'` à union de roles em todos os pontos onde a union está declarada.

---

### 2. Config Central — `ROLE_CAN_CREATE` em `dal.ts`

Único objeto que define quem pode criar/gerenciar quem. Substitui todos os `if (role === 'adm_produto')` hardcoded.

```ts
export const ROLE_CAN_CREATE: Partial<Record<Role, Role[]>> = {
  gestor:               ['admin', 'vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm',
                         'coord_aprovacao', 'assistente_aprovacao', 'projetista'],
  admin:                ['vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm',
                         'coord_aprovacao', 'assistente_aprovacao', 'projetista'],
  adm_produto:          ['coord_aprovacao', 'assistente_aprovacao', 'projetista'],
  coord_aprovacao:      ['assistente_aprovacao', 'projetista'],
  assistente_aprovacao: ['projetista'],
}

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return ROLE_CAN_CREATE[actorRole]?.includes(targetRole) ?? false
}
```

---

### 3. APIs de Gestão de Usuários

#### `GET /api/usuarios`
- `gestor`: vê todos os usuários (sem mudança)
- Demais: veem apenas usuários cujo role está em `ROLE_CAN_CREATE[session.role]`
- Substitui: `WHERE u.role IN ('coord_aprovacao', 'projetista')` hardcoded para `adm_produto`

#### `PATCH /api/usuarios/[id]/role`
Três verificações em ordem:
1. `ROLE_CAN_CREATE[session.role]` existe e não está vazio → ator tem permissão de gerenciar
2. `role` alvo está em `ROLE_CAN_CREATE[session.role]` → role solicitada é permitida
3. `targetUser.role` está em `ROLE_CAN_CREATE[session.role]` → usuário alvo é subordinado do ator

Remove: blocos `isAdmProduto && ADM_PRODUTO_ALLOWED` hardcoded.

#### `POST /api/auth/create-usuario` (auth-actions.ts)
- Verifica que `body.role` está em `ROLE_CAN_CREATE[session.role]`
- Sem mudança de comportamento para `gestor`/`admin`

---

### 4. Permissões TGov

`assistente_aprovacao` recebe as mesmas permissões que `coord_aprovacao` nos helpers de `dal.ts`:

| Helper | Antes | Depois |
|--------|-------|--------|
| `canReadTgov` | coord_aprovacao ✓ | + assistente_aprovacao ✓ |
| `canWriteTgov` | coord_aprovacao ✓ | + assistente_aprovacao ✓ |
| `canCommentTgov` | coord_aprovacao ✓ | + assistente_aprovacao ✓ |

Isso dá a `assistente_aprovacao` acesso a: leitura TGov, nova proposta, atribuição de técnico, comentários.

`projetista` permanece igual: só vê propostas atribuídas (`tecnico_id = session.userId`), pode comentar.

---

### 5. Acesso à Página de Usuários

**`/cadastro-vendedor`** passa a aceitar `coord_aprovacao` e `assistente_aprovacao` além dos atuais `gestor`, `admin`, `adm_produto`.

Cada role vê apenas os usuários que pode gerenciar (derivado de `ROLE_CAN_CREATE`).

---

### 6. UI — Formulário de Criação

**`CadastroVendedorClient.tsx`** — o select de role filtra as opções exibidas para `ROLE_CAN_CREATE[userRole]`. Hoje mostra todas as opções e o backend rejeita; passa a filtrar no front para UX consistente.

**Sidebar** — `coord_aprovacao` e `assistente_aprovacao` ganham link "Usuarios TGov" → `/cadastro-vendedor`.

---

### 7. Visual

**Badge `assistente_aprovacao`:**
- Label: `"Assist. Aprovação"`
- Cor: `bg-cyan-50 text-cyan-600` (distinto do sky do `coord_aprovacao` e violet do `projetista`)

Todos os pontos com switch/map de roles recebem a nova entrada: `Sidebar.tsx`, `CadastroVendedorClient.tsx`, `next-auth.d.ts`, `dal.ts`, `validations.ts`.

---

## Arquivos Impactados

| Arquivo | Mudança |
|---------|---------|
| `web/src/types/next-auth.d.ts` | + `assistente_aprovacao` na union |
| `web/src/lib/dal.ts` | + role na union, + `ROLE_CAN_CREATE`, + `canManageRole`, update helpers TGov |
| `web/src/lib/validations.ts` | + role na lista de roles válidos |
| `web/src/lib/auth-actions.ts` | usar `ROLE_CAN_CREATE` em vez de lista hardcoded |
| `web/src/app/api/usuarios/route.ts` | usar `ROLE_CAN_CREATE` para filtro de visibilidade |
| `web/src/app/api/usuarios/[id]/role/route.ts` | usar `canManageRole` em vez de `ADM_PRODUTO_ALLOWED` |
| `web/src/app/cadastro-vendedor/page.tsx` | + acesso para coord_aprovacao, assistente_aprovacao |
| `web/src/app/cadastro-vendedor/CadastroVendedorClient.tsx` | filtrar select de roles + badges |
| `web/src/components/Sidebar.tsx` | + nav para assistente_aprovacao, + Usuarios TGov para coord/assistente |
| `web/src/middleware.ts` | garantir que assistente_aprovacao tem acesso às rotas corretas |

---

## O Que NÃO Muda

- Permissões de `gestor`, `admin`, `adm_produto`, `csm`, `projetista` existentes
- Lógica do CRM (leads, vendas, comissões) — roles TGov não têm acesso a essas rotas
- Comportamento de `projetista` no TGov (só vê propostas atribuídas)
- Tabelas do banco — nenhuma migration necessária

---

## Spec 2 e 3 (fora deste escopo)

- **Spec 2:** Sistema de notificações NOVO in-app com seen tracking
- **Spec 3:** Report diário por email (2x/dia, com provider a definir)
