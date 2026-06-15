# Expansão Projetus: IBI + Mentoria + Conta Azul

Data: 2026-06-08
Status: Draft v1
Owner sugerido: Paulo / Sigma

## 1. Resumo executivo

As novas demandas formam uma expansão real do `Projete`, não apenas integrações isoladas:

1. `IBI` adiciona um novo domínio operacional de projetos, orçamento, documentos e acompanhamento.
2. A `plataforma própria de cursos` adiciona um novo produto digital com receita, acesso, vídeo e cobrança.
3. `Conta Azul` adiciona uma camada financeira formal para consolidar vendas, contas a receber e contas do projeto.

Recomendação principal:

- manter o `Projete` como hub operacional central;
- tratar cada frente como um `bounded context` separado;
- evitar acoplar tudo diretamente nas tabelas atuais de CRM/TGov;
- lançar a mentoria em `web first`, não `mobile first`;
- usar `sync assíncrono + trilha de auditoria` para IBI e Conta Azul;
- deixar a frente de fintech/factoring como trilha futura, não como escopo de julho.

## 2. Base atual do sistema

Hoje o repositório já suporta um hub interno com:

- CRM comercial;
- pipeline e BI de TGov;
- execução e CSM;
- autenticação por papéis;
- operação web em produção.

Infra atual documentada no repositório:

- host da aplicação: `sigma-apps`;
- URL pública: `https://projete.sigmaintel.io`;
- banco: `projetus_hub` em `sigma-db`;
- runtime: Coolify.

Conclusão: a base existente já comporta crescer como hub operacional, mas precisa de modularização de domínio para não virar um monólito confuso.

## 3. Arquitetura alvo

### 3.1 Princípio

O `Projete` deve virar um hub com quatro domínios claros:

1. `Core CRM/Operação`
2. `Projetos Integrados (IBI Mirror)`
3. `Educação/Mentoria`
4. `Financeiro/ERP Sync`

### 3.2 Desenho lógico

```text
                    +----------------------+
                    |   Frontend Web       |
                    |   Next.js / App      |
                    +----------+-----------+
                               |
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
+---------------+    +-------------------+    +-------------------+
| Core CRM/TGov |    | Educacao/Mentoria |    | Financeiro Interno |
+-------+-------+    +---------+---------+    +----------+--------+
        |                        |                         |
        v                        v                         v
+---------------+    +-------------------+    +-------------------+
| PostgreSQL    |    | Video Provider    |    | Conta Azul Sync   |
| projetus_hub  |    | Streaming/DRM     |    | OAuth2 + Polling  |
+-------+-------+    +-------------------+    +----------+--------+
        |
        v
+---------------+
| IBI Sync      |
| Pull + Mirror |
+---------------+
```

### 3.3 Decisões estruturais

- `Projete` continua sendo o hub principal da operação.
- `IBI` entra como integração espelhada, não como fonte miscigenada direto nas tabelas atuais.
- `Conta Azul` deve ser sistema contábil/financeiro formal, enquanto o `Projete` continua dono do contexto operacional.
- A mentoria deve compartilhar autenticação e permissões do hub, mas com modelo de dados próprio.
- Vídeo não deve ser hospedado cru no servidor atual; o app deve guardar metadados e permissões, e o streaming ficar num provedor especializado.

## 4. Frente 1: integração com IBI

## Objetivo

Trazer para dentro do `Projete` a visão integralizada de projetos, documentos, orçamento, status e histórico operacional que hoje vivem no IBI.

## Escopo MVP

O MVP da integração deve espelhar somente leitura primeiro:

- cadastro de projetos;
- organização/cliente vinculada;
- situação do projeto;
- orçamento e marcos financeiros;
- documentos e links;
- responsáveis;
- histórico de atualização.

Evitar no MVP:

- escrita bidirecional;
- edição concorrente nos dois lados;
- automações financeiras definitivas sem reconciliação.

## Arquitetura sugerida

### Camada 1: ingestão bruta

Criar tabelas de espelho para payloads do IBI:

- `ibi_sync_runs`
- `ibi_raw_projects`
- `ibi_raw_budgets`
- `ibi_raw_documents`
- `ibi_raw_status_events`

Objetivo:

- guardar payload original;
- permitir replay;
- auditar divergências;
- desacoplar mudanças da API do modelo interno.

### Camada 2: normalização

Criar entidades internas derivadas:

- `integrated_projects`
- `integrated_project_budget_lines`
- `integrated_project_documents`
- `integrated_project_contacts`
- `integrated_project_status_history`

### Camada 3: apresentação

Criar um módulo novo no app com:

- lista de projetos;
- visão detalhe por projeto;
- orçamento;
- documentos;
- timeline;
- indicadores de divergência entre IBI e Projete.

## Regras de ownership

- `IBI` é dono inicial do dado de projeto já existente lá.
- `Projete` é dono das anotações locais, classificação comercial, relacionamento e automações internas.
- Campos sensíveis precisam de mapeamento explícito `source_of_truth`.

## Riscos e dependências

- ainda não há documentação pública de API do IBI claramente indexada e validada;
- precisamos confirmar autenticação, paginação, rate limit, anexos e webhooks diretamente com o time do IBI;
- sem isso, a estimativa de integração é apenas arquitetural, não contratual.

## Perguntas para a reunião técnica com IBI

1. Existe API pública ou privada? REST, GraphQL ou exportação por arquivo?
2. Há sandbox?
3. Como funciona autenticação?
4. Existem webhooks ou apenas consulta periódica?
5. Como anexos/documentos são entregues?
6. Qual é o identificador estável do projeto?
7. Há entidades separadas para projeto, orçamento, desembolso e documento?
8. Existe limite de requisição?
9. Existe trilha de alterações por usuário?
10. Quais operações aceitam escrita?

## 5. Frente 2: plataforma própria de cursos e mentoria

## Objetivo

Substituir dependência de Hotmart para a nova mentoria, reduzindo taxa recorrente e criando base proprietária de distribuição, acesso e monetização.

## Diretriz principal

Para a meta da segunda semana de julho, a plataforma deve ser:

- `web first`;
- simples;
- confiável;
- orientada a conteúdo e acesso;
- sem dependência de app mobile no primeiro lançamento.

## Escopo MVP de julho

O MVP precisa entregar:

- área pública da mentoria;
- checkout ou registro de compra;
- catálogo de cursos/programas;
- módulos e aulas;
- player de vídeo;
- controle de acesso por aluno;
- progresso por aula;
- materiais complementares;
- área administrativa para cadastrar cursos, módulos e aulas.

Desejável, mas não bloqueante para julho:

- comunidade nativa;
- certificados;
- gamificação;
- app mobile;
- afiliados;
- automações complexas de upsell.

## Arquitetura sugerida

### Domínio de dados

Criar entidades separadas:

- `education_products`
- `education_cohorts`
- `education_modules`
- `education_lessons`
- `education_enrollments`
- `education_progress`
- `education_assets`
- `education_access_grants`

### Vídeo

Não armazenar os 250 vídeos diretamente no servidor da aplicação.

Modelo recomendado:

- app guarda metadados, ordem, permissões e progresso;
- provedor externo cuida de upload, transcoding, streaming e entrega;
- links assinados ou playback tokens para reduzir exposição direta do arquivo.

### Pagamentos

Criar uma camada `payment_adapter`, sem amarrar o domínio da mentoria a um gateway único.

Entidades mínimas:

- `orders`
- `order_items`
- `payments`
- `refunds`
- `billing_customers`

### Acesso

O direito de acesso do aluno deve nascer de um evento de negócio:

- compra aprovada;
- bolsa manual;
- convite administrativo;
- parceria/cortesia.

## Recomendação comercial/técnica

Se o objetivo é fugir da taxa de 10% e lançar rápido, o ganho vem de:

- possuir o relacionamento com o aluno;
- possuir os dados de compra e consumo;
- não depender do ecossistema de terceiros para catálogo e acesso.

O risco de tentar copiar a Hotmart inteira já no primeiro mês é alto.

Então a recomendação é:

- construir primeiro um `LMS/mentoria owner-operated`;
- adiar marketplace, afiliados, área do produtor e automações avançadas.

## 6. Frente 3: Conta Azul integrada no Projete

## Objetivo

Consolidar fluxo financeiro e operacional entre `Projete` e `Conta Azul`, conectando clientes, vendas e contas a receber/pagar ao contexto dos projetos e da mentoria.

## Fatos confirmados em documentação oficial

A API da Conta Azul hoje expõe, entre outros, módulos de:

- vendas;
- cadastros;
- produtos e serviços;
- financeiro;
- contratos;
- notas fiscais.

Pontos técnicos relevantes já confirmados:

- autenticação via `OAuth 2.0`;
- padrão `REST/JSON`;
- limite de `600 chamadas por minuto` e `10 por segundo` por conta conectada;
- sem `webhooks` no momento, exigindo `polling`;
- conta de desenvolvedor para testes, sem sandbox dedicado clássico.

## Estratégia de integração

### Ownership recomendado

- `Projete` é dono do contexto operacional: projeto, curso, relacionamento, turma, venda contextual.
- `Conta Azul` é dona do registro financeiro formal: cobrança, baixa, conciliação e documento contábil.

### Fluxos prioritários

Fase 1:

- criar/sincronizar clientes;
- criar produtos/serviços essenciais;
- criar contas a receber ligadas a vendas da mentoria ou serviços;
- consultar status de pagamento/baixa.

Fase 2:

- contas a pagar ligadas a operação de projeto;
- contratos recorrentes;
- indicadores financeiros no dashboard do Projete.

### Arquitetura de sync

Criar uma fila de sincronização semelhante ao raciocínio usado em integrações operacionais:

- `conta_azul_sync_queue`
- `conta_azul_entity_map`
- `conta_azul_sync_runs`
- `conta_azul_raw_events`

Processo:

1. evento interno gera item de sync;
2. worker faz envio idempotente;
3. resposta externa é persistida;
4. polling periódico atualiza status financeiro;
5. divergências ficam visíveis no painel administrativo.

## Riscos e cuidados

- sem webhook, o sistema precisa de polling disciplinado;
- `Conta Azul` não deve virar dependência síncrona de telas críticas;
- credenciais OAuth2 precisam de armazenamento seguro e rotação;
- o modelo financeiro precisa bater com fiscal/operacional antes de automatizar demais.

## 7. Roadmap sugerido

## Sprint 0: descoberta e contratos

Objetivo: remover incerteza estrutural.

Entregas:

- mapa de dados do IBI;
- fluxo financeiro alvo com Conta Azul;
- definição do modelo comercial da mentoria;
- definição do provedor de vídeo;
- definição do gateway de pagamento.

## Sprint 1: fundação técnica

Entregas:

- novas tabelas de integração;
- fila genérica de sync;
- módulo administrativo inicial;
- scaffolding de mentoria;
- autenticação e permissões do novo domínio.

## Sprint 2: mentoria MVP

Entregas:

- catálogo;
- aulas;
- player;
- matrícula/acesso;
- área do aluno;
- painel admin de conteúdo.

## Sprint 3: Conta Azul MVP

Entregas:

- OAuth2;
- sync de clientes;
- sync de produtos/serviços;
- criação de cobrança/recebível;
- polling de baixa/pagamento.

## Sprint 4: IBI Mirror MVP

Entregas:

- coleta inicial;
- espelho de projetos;
- timeline;
- orçamento;
- documentos;
- reconciliação visual.

## 8. O que cabe até sexta-feira

Entrega realista até sexta:

1. arquitetura validada;
2. matriz de integração IBI;
3. desenho de dados da mentoria;
4. desenho de integração Conta Azul;
5. backlog técnico priorizado;
6. estimativa por blocos.

Não é realista até sexta:

- integrar IBI completo sem documentação;
- construir uma Hotmart própria full;
- automatizar financeiro ponta a ponta sem desenho de processo.

## 9. Trilha futura: lending/factoring

Essa frente é promissora, mas deve ficar fora do escopo imediato.

Pré-requisitos mínimos antes de mexer nisso:

- dados financeiros confiáveis;
- conciliação operacional robusta;
- trilha de auditoria;
- consentimento e governança de dados;
- análise jurídica/regulatória;
- política de risco e inadimplência;
- parceiro financeiro ou estrutura regulada.

Recomendação: tratar como `Discovery Track` separado depois que IBI + Mentoria + Conta Azul estiverem operando.

## 10. Decisões recomendadas agora

1. Aprovar `web first` para mentoria.
2. Aprovar `IBI como mirror/read-first`, não bidirecional no início.
3. Aprovar `Conta Azul como sistema financeiro formal`, com sync assíncrono.
4. Aprovar separação de domínios dentro do `Projete`.
5. Congelar a frente de fintech como trilha futura.

## 11. Próximos passos imediatos

1. Agendar reunião técnica com IBI com pauta fechada.
2. Confirmar com financeiro quais objetos precisam existir na Conta Azul já no MVP.
3. Fechar decisão de provedor de vídeo e gateway de pagamento.
4. Transformar este documento em backlog técnico de implementação.

## 12. Referências externas validadas em 2026-06-08

Conta Azul:

- visão geral das APIs: `https://developers.contaazul.com/aboutapis`
- requisitos técnicos e rate limits: `https://developers.contaazul.com/minimumrequirements`
- credenciais e fluxo de acesso: `https://developers.contaazul.com/guide`
- artigo oficial de escopo dos módulos expostos: `https://ajuda.contaazul.com/hc/pt-br/articles/45613146369933-Integra%C3%A7%C3%A3o-API-quais-dados-posso-acessar-e-manipular-via-API`

IBI:

- até esta data, não foi localizada documentação pública de API claramente confirmável e indexada para uso de integração;
- a viabilidade detalhada da frente IBI continua dependente de reunião técnica e documentação do fornecedor.
