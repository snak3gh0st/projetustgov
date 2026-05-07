# Coordenador Export Filtrado por Comercial - Design Spec

**Data:** 2026-05-07
**Status:** Aprovado pelo usuário

## Visão Geral

Ajustar a exportação CSV existente da tela `/leads` para permitir uso por `coordenador`, mas somente em modo filtrado por `comercial` selecionado. O objetivo é atender o caso do Rooger sem criar uma exportação paralela e sem abrir acesso amplo da base para coordenadores.

## Requisito 1: Exportação para Coordenador

### Comportamento

- `gestor` e `admin` continuam com o comportamento atual: podem exportar a base inteira ou filtrada.
- `coordenador` passa a ver os botões de exportação na tela `/leads`.
- Para `coordenador`, a exportação só é permitida quando houver um `comercial` selecionado no filtro de vendedor.
- O arquivo exportado mantém o layout atual da rota `/api/leads/export-pendentes`.

### Regra de Acesso

- `gestor` e `admin`: `vendedor_id` opcional.
- `coordenador`: `vendedor_id` obrigatório.
- Se `coordenador` tentar exportar sem `vendedor_id`, a API retorna `403`.

## Requisito 2: Respeitar o Filtro de Comercial

### Fonte do Filtro

A tela `/leads` já possui o seletor:

- `Todos Vendedores`
- `Não atribuídos`
- vendedores/coordenadores/gestores ativos

O valor selecionado em `vendedorFilter` deve ser enviado para a rota de exportação.

### Escopo do CSV

- Quando `vendedor_id` for informado, o SQL exporta apenas linhas de `vendedor_projetos` atribuídas àquele usuário.
- O filtro `pendentes` continua funcionando junto com `vendedor_id`.
- O formato do arquivo não muda: mesmas colunas, mesma lógica de contatos dinâmicos e mesmo BOM UTF-8.

## UI

### Tela `/leads`

- Reaproveitar os botões atuais `Exportar CSV` e `Exportar Pendentes CSV`.
- Mostrar esses botões para `gestor`, `admin` e `coordenador`.
- Para `coordenador`, os links de exportação incluem o `vendedor_id` atualmente selecionado.
- Se `coordenador` não tiver selecionado um comercial, o botão deve ficar desabilitado ou não disparar exportação.

### UX Esperada

- `gestor/admin` mantêm a flexibilidade atual.
- `coordenador` enxerga um fluxo coerente com a própria tela: escolhe o comercial e baixa a planilha daquele comercial.

## API

### Endpoint

`GET /api/leads/export-pendentes`

### Novos Query Params

- `filter=pendentes` já existente
- `vendedor_id=<uuid|unassigned|empty>` novo uso para exportação

### Regras de Backend

- Validar sessão autenticada.
- Reaproveitar o gate de exportação existente, mas incluir `coordenador` com regra restrita.
- Para `coordenador`, bloquear chamadas sem `vendedor_id` real de comercial.
- Aplicar o `WHERE vp.vendedor_id = $n` quando o filtro vier preenchido.
- Não permitir que `coordenador` use a URL manualmente para obter exportação global.

## Arquivos a Modificar

- `web/src/lib/dal.ts`
  - ajustar o gate de exportação para contemplar `coordenador`
- `web/src/app/leads/LeadsClient.tsx`
  - enviar `vendedorFilter` para os botões de exportação
  - mostrar exportação para `coordenador`
  - bloquear exportação sem comercial selecionado no caso de `coordenador`
- `web/src/app/api/leads/export-pendentes/route.ts`
  - aceitar `vendedor_id`
  - validar o papel `coordenador`
  - aplicar o filtro no SQL

## Segurança

- O controle principal fica no backend.
- A UI só melhora a experiência; não é a barreira de segurança.
- O ajuste é por papel (`coordenador`), não por usuário hardcoded.
- O recorte por comercial evita que coordenadores baixem a carteira inteira.

## Aceitação

- [ ] `gestor` consegue exportar CSV geral sem filtro.
- [ ] `gestor` consegue exportar CSV filtrado por comercial.
- [ ] `coordenador` vê os botões de exportação na tela `/leads`.
- [ ] `coordenador` sem comercial selecionado não consegue exportar.
- [ ] `coordenador` com comercial selecionado exporta apenas leads daquele comercial.
- [ ] `Exportar Pendentes CSV` continua respeitando o filtro de pendentes.
- [ ] O layout do arquivo exportado permanece inalterado.
