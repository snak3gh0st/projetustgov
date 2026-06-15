# Backlog Técnico: Mentoria + Conta Azul

Data: 2026-06-08
Status: Draft v1
Dependência externa pendente: IBI

## 1. Objetivo deste backlog

Transformar o plano de expansão em tarefas executáveis sem depender ainda da documentação do IBI.

Escopo deste backlog:

- fundação técnica da mentoria;
- fundação técnica da integração com Conta Azul;
- base de dados, segurança e observabilidade;
- preparação para conectar IBI depois.

## 2. Ordem recomendada

1. fundação de dados
2. mentoria MVP
3. billing interno
4. Conta Azul sync
5. dashboards operacionais
6. IBI mirror, quando chegarem os contratos

## 3. Épicos

## Epic A: fundação de schema e domínio

Objetivo:

- criar os modelos base para conteúdo, matrícula, billing e sync financeiro.

Tasks:

1. criar tabelas de `education_*`
2. criar tabelas de `orders/payments/refunds`
3. criar tabelas de `conta_azul_*`
4. definir índices mínimos de lookup e reconciliação
5. documentar ownership de cada entidade

Aceite:

- schema cobre catálogo, aulas, acesso, compra, pagamento e sync externo;
- sem depender de role `student` no modelo atual;
- suporta integração gradual.

Estimativa:

- `1-2 dias`

## Epic B: admin de mentoria

Objetivo:

- permitir que a equipe cadastre produtos educacionais e organize o conteúdo.

Tasks:

1. criar menu/admin de mentoria
2. CRUD de produtos
3. CRUD de módulos
4. CRUD de aulas
5. upload/registro de assets de vídeo e anexos
6. ordenação de módulos e aulas

Aceite:

- um admin cria um curso completo sem SQL manual;
- o sistema guarda ordem, slug, status e metadados;
- aulas podem ser publicadas e ocultadas.

Estimativa:

- `3-5 dias`

## Epic C: área do aluno

Objetivo:

- entregar o consumo do conteúdo com controle de acesso e progresso.

Tasks:

1. tela de catálogo/logada
2. detalhe do programa
3. tela de player/aula
4. controle de acesso por matrícula
5. progresso por aula
6. retomada do ponto anterior
7. materiais complementares

Aceite:

- aluno vê apenas o que comprou ou recebeu;
- progresso fica persistido;
- vídeo e anexos obedecem permissão.

Estimativa:

- `4-6 dias`

## Epic D: checkout e billing interno

Objetivo:

- registrar a venda no Projete antes da conciliação externa.

Tasks:

1. modelar `orders`, `order_items`, `payments`
2. criar fluxo de pedido pendente
3. registrar aprovação, falha, cancelamento e reembolso
4. emitir evento de concessão de acesso
5. criar painel interno de status do pedido

Aceite:

- compra aprovada gera acesso;
- compra pendente não gera acesso;
- cancelamento/reembolso pode revogar acesso conforme regra.

Estimativa:

- `2-4 dias`

## Epic E: integração Conta Azul

Objetivo:

- enviar clientes e títulos financeiros relevantes para a Conta Azul e trazer status financeiro.

Tasks:

1. configurar credenciais OAuth2
2. persistir conexão por conta/tenant
3. sincronizar clientes
4. sincronizar produtos ou serviços mínimos
5. criar contas a receber
6. polling de pagamento/baixa
7. mapear ids internos x externos
8. registrar payload bruto e erros

Aceite:

- pedido elegível gera item na fila;
- worker envia sem duplicar entidade;
- status financeiro volta ao Projete;
- falhas ficam auditáveis.

Estimativa:

- `4-6 dias`

## Epic F: observabilidade e operação

Objetivo:

- dar confiança operacional ao lançamento.

Tasks:

1. criar log de sync
2. criar retry/backoff
3. criar painel admin de filas com erro
4. criar alertas básicos
5. criar checklist de virada para produção

Aceite:

- operação sabe o que sincronizou, falhou e reprocessou;
- time não depende de banco/manual para entender travas.

Estimativa:

- `2-3 dias`

## 4. Dependências críticas

## Decidir agora

1. provedor de vídeo
2. gateway de pagamento principal
3. regra de revogação de acesso em caso de chargeback/reembolso
4. quem pode administrar a mentoria no app atual
5. naming oficial do módulo no menu: `Mentoria`, `Cursos`, `Academy` ou outro

## Pode esperar

1. detalhes do IBI
2. factoring/lending
3. app mobile nativo
4. afiliados
5. certificados

## 5. Riscos

1. tentar recriar a Hotmart inteira no MVP
2. hospedar vídeo bruto no servidor da aplicação
3. acoplar acesso do aluno ao role interno atual de usuários
4. depender de chamadas síncronas à Conta Azul em tela crítica
5. não guardar idempotência e payload bruto da integração

## 6. Corte de MVP para julho

Se o prazo apertar, manter apenas:

1. admin de conteúdo
2. catálogo
3. player
4. matrícula/acesso
5. pedido interno
6. integração mínima com cobrança

Adiar:

1. comunidade
2. certificados
3. afiliados
4. analytics avançado
5. automações comerciais sofisticadas

## 7. Proposta de execução em paralelo

Trilha A:

- schema
- admin de mentoria
- área do aluno

Trilha B:

- billing interno
- Conta Azul sync
- observabilidade

Trilha C:

- discovery de IBI, quando o material chegar

## 8. Próximo artefato sugerido

Depois deste backlog, o próximo passo ideal é quebrar em:

- `tasks.md` por épico
- migrations aplicáveis
- scaffolding de rotas e páginas no `web/`
