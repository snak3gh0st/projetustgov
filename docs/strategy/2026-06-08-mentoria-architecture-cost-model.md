# Mentoria Própria: Arquitetura e Modelo de Custos

Data: 2026-06-08
Status: Draft v1
Escopo: plataforma própria para mentoria/curso com 250 vídeos de alta qualidade em 52 aulas

## 1. Resposta executiva

Sim, é viável montar uma plataforma própria para esse acervo.

Minha recomendação não é construir uma `Hotmart completa`.
Minha recomendação é construir:

- checkout próprio;
- área de membros própria;
- streaming terceirizado;
- pagamento terceirizado;
- billing e acesso controlados pelo `Projete`.

Esse modelo captura a maior parte da margem e do controle, sem obrigar o time a reconstruir todo o ecossistema da Hotmart.

## 2. Decisão recomendada

## Recomendação principal

Construir um `LMS/mentoria própria` com:

- `Next.js` no stack já existente do `Projete`;
- `PostgreSQL` no banco já existente;
- `Cloudflare Stream` para vídeo;
- `Stripe` como opção principal de gateway;
- `Mercado Pago` como alternativa local forte, principalmente se o foco for Brasil e recorrência com Pix/boleto;
- `Conta Azul` sincronizada de forma assíncrona depois da venda;
- subdomínio dedicado para a experiência pública/aluno.

## O que não fazer agora

- não tentar copiar afiliados, marketplace e ecossistema completo da Hotmart;
- não hospedar vídeo bruto no servidor da aplicação;
- não misturar aluno externo com os papéis internos atuais do CRM.

## 3. Arquitetura sugerida

## 3.1 Domínios

Separar o produto em quatro blocos:

1. `Public Web / Checkout`
2. `Learner App / Area do aluno`
3. `Admin de Conteudo`
4. `Billing + Sync Financeiro`

## 3.2 Desenho lógico

```text
                   +-----------------------------+
                   | academy.projete.sigmaintel  |
                   | Landing + Checkout + Login  |
                   +-------------+---------------+
                                 |
         +-----------------------+------------------------+
         |                        |                        |
         v                        v                        v
+----------------+      +-------------------+     +-------------------+
| Admin Conteudo |      | Area do Aluno     |     | Billing Interno   |
| cursos/aulas   |      | player/progresso  |     | pedidos/pagamento |
+--------+-------+      +---------+---------+     +---------+---------+
         |                          |                         |
         +--------------------------+-------------------------+
                                    |
                                    v
                         +-------------------------+
                         | PostgreSQL projetus_hub |
                         | education_* / orders_*  |
                         +-----------+-------------+
                                     |
                 +-------------------+----------------------+
                 |                                          |
                 v                                          v
      +-------------------------+               +----------------------+
      | Cloudflare Stream       |               | Gateway de Pagamento |
      | upload/encode/playback  |               | Stripe ou MP         |
      +-------------------------+               +-----------+----------+
                                                            |
                                                            v
                                                 +----------------------+
                                                 | Conta Azul Sync      |
                                                 | clientes/recebiveis  |
                                                 +----------------------+
```

## 3.3 Infra recomendada

Aproveitar o que já existe no `Projete`:

- app host atual: `sigma-apps`
- database host atual: `sigma-db`
- runtime atual: `Coolify`

Recomendação prática:

- manter a mentoria no mesmo monorepo;
- publicar em subdomínio dedicado;
- isolar o domínio funcional por rotas, tabelas e permissões;
- tratar vídeo e pagamento como integrações externas.

## 4. Auth e identidade

## Staff

Continuam usando o sistema atual de usuários internos.

## Alunos

Criar identidade separada para aluno, sem reutilizar o `role` interno atual.

Modelo recomendado:

- `learners`
- `learner_sessions`
- `education_enrollments`

Se quiser reduzir atrito no MVP:

- login por magic link ou senha + email;
- reset simples;
- sem SSO complexo no início.

## 5. Módulos do MVP

## Módulo 1: catálogo e página de venda

- landing page;
- programa da mentoria;
- FAQ;
- CTA de compra.

## Módulo 2: checkout

- pedido;
- pagamento;
- aprovação;
- concessão de acesso.

## Módulo 3: área do aluno

- dashboard do aluno;
- lista de módulos;
- player da aula;
- progresso;
- anexos.

## Módulo 4: admin

- cadastro de curso;
- módulos;
- aulas;
- vídeos;
- publicação.

## Módulo 5: billing

- orders;
- payments;
- refunds;
- integração com ERP depois.

## 6. Vídeo: escolha recomendada

## Opção recomendada: Cloudflare Stream

Motivos:

- preço simples;
- cobrança por minutos armazenados e assistidos;
- encoding incluso;
- player/entrega resolvidos;
- ótima relação entre simplicidade e custo.

## Preços oficiais validados em 2026-06-08

Cloudflare Stream:

- armazenamento: `US$ 5 por 1.000 minutos armazenados`
- entrega: `US$ 1 por 1.000 minutos assistidos`
- ingest e encoding: `grátis`

Fonte:

- https://developers.cloudflare.com/stream/pricing/

## Alternativas

### Bunny Stream

Boa opção se o foco for custo extremamente baixo e o time aceitar mais variabilidade operacional.

Referências oficiais validadas:

- storage default region: `US$ 0.01/GB`
- CDN South America standard network: `US$ 0.045/GB`
- DRM enterprise base fee: `US$ 99/mês`

Fonte:

- https://docs.bunny.net/stream/pricing

### Mux

Excelente produto, mas normalmente mais indicado quando a empresa quer stack de vídeo mais premium ou analytics mais avançado.

Fonte:

- https://www.mux.com/pricing
- https://www.mux.com/docs/pricing/overview

## 7. Pagamento: Stripe vs Mercado Pago

## Opção A: Stripe

Melhor quando:

- vocês querem API muito boa;
- querem UX moderna de checkout;
- querem evoluir produto com mais liberdade;
- topam uma operação financeira mais global/produto-first.

### Preços oficiais validados em 2026-06-08

- cartão nacional: `3,99% + R$ 0,39`
- boleto pago: `R$ 3,45`
- Pix: `1,19%` (somente por convite)

Fonte:

- https://stripe.com/br/pricing

## Opção B: Mercado Pago

Melhor quando:

- Brasil é claramente o foco;
- Pix e boleto são muito relevantes;
- o time prefere aderência local forte;
- o recebimento e a operação já conversam bem com Mercado Pago.

### Preços oficiais validados em 2026-06-08

Para assinaturas e checkout online, a documentação pesquisada mostra:

- cartão: `4,98%` na hora
- cartão: `4,49%` em 14 dias
- cartão: `3,98%` em 30 dias
- boleto: `R$ 3,49`
- Pix: `0,99%`

Fonte:

- https://omega.mercadopago.com.br/ajuda/quanto-custa-receber-pagamentos-assinaturas_19495
- https://www.mercadopago.com.br/developers/pt/support/33392

## Recomendação prática

### Se prioridade for produto e engenharia:

Escolher `Stripe`.

### Se prioridade for Brasil + Pix + operação comercial local:

Escolher `Mercado Pago`.

### Minha sugestão

MVP:

- `Stripe` se o time quiser stack mais limpa e previsível para produto;
- `Mercado Pago` se o comercial exigir fortemente Pix/boleto e recorrência brasileira desde o dia 1.

## 8. Comparação direta com Hotmart

## Preços oficiais Hotmart validados em 2026-06-08

Pesquisado hoje:

- taxa base divulgada: `9,9% + R$ 1,00` por venda aprovada em cenários gerais divulgados para BRL;
- player Hotmart: `R$ 2,49` por venda quando o produto usa o player.

Fontes:

- https://hotmart.com/pt-br/taxa-hotmart
- https://help.hotmart.com/pt-br/article/208298448

## Custo por venda

### Ticket de R$ 497

- Hotmart + player: `R$ 52,69`
- Stripe cartão: `R$ 20,22`
- Mercado Pago cartão 30 dias: `R$ 19,78`

Economia bruta contra Hotmart:

- Stripe: `R$ 32,47`
- Mercado Pago: `R$ 32,91`

### Ticket de R$ 997

- Hotmart + player: `R$ 102,19`
- Stripe cartão: `R$ 40,17`
- Mercado Pago cartão 30 dias: `R$ 39,68`

Economia bruta contra Hotmart:

- Stripe: `R$ 62,02`
- Mercado Pago: `R$ 62,51`

### Ticket de R$ 1.497

- Hotmart + player: `R$ 151,69`
- Stripe cartão: `R$ 60,12`
- Mercado Pago cartão 30 dias: `R$ 59,58`

Economia bruta contra Hotmart:

- Stripe: `R$ 91,57`
- Mercado Pago: `R$ 92,11`

## Leitura correta

O ganho não vem só de economizar taxa.
Vem também de:

- possuir a base de alunos;
- controlar UX e funil;
- plugar Conta Azul depois;
- manter margem e dados dentro da operação.

## 9. Assunções para custo de vídeo

Como você informou `250 vídeos` mas não informou duração média por vídeo, usei dois cenários:

### Cenário Base

- `250 vídeos x 15 min`
- total: `3.750 minutos`
- `62,5 horas`

### Cenário Alto

- `250 vídeos x 20 min`
- total: `5.000 minutos`
- `83,3 horas`

## 10. Custo mensal de vídeo com Cloudflare Stream

## Armazenamento

### Cenário Base

- `3.750 min`
- custo: `US$ 18,75/mês`

### Cenário Alto

- `5.000 min`
- custo: `US$ 25,00/mês`

## Entrega

Exemplos usando preço oficial de `US$ 1 por 1.000 minutos assistidos`.

### 100 alunos ativos

- 300 min/aluno/mês: `30.000 min` => `US$ 30/mês`
- 600 min/aluno/mês: `60.000 min` => `US$ 60/mês`
- 1.200 min/aluno/mês: `120.000 min` => `US$ 120/mês`

### 300 alunos ativos

- 300 min/aluno/mês: `90.000 min` => `US$ 90/mês`
- 600 min/aluno/mês: `180.000 min` => `US$ 180/mês`
- 1.200 min/aluno/mês: `360.000 min` => `US$ 360/mês`

### 1.000 alunos ativos

- 300 min/aluno/mês: `300.000 min` => `US$ 300/mês`
- 600 min/aluno/mês: `600.000 min` => `US$ 600/mês`
- 1.200 min/aluno/mês: `1.200.000 min` => `US$ 1.200/mês`

## Total mensal estimado de vídeo

### Cenário Base realista

- acervo base: `US$ 18,75`
- 300 alunos x 600 min/mês: `US$ 180`
- total: `US$ 198,75/mês`

### Cenário Forte

- acervo alto: `US$ 25`
- 1.000 alunos x 600 min/mês: `US$ 600`
- total: `US$ 625/mês`

Mesmo com uso relevante, o vídeo continua muito mais barato do que a maioria das pessoas imagina.

## 11. Custo de app/infra

## Aproveitando a infra atual

Se vocês reaproveitarem o runtime atual do `Projete`, o custo incremental de aplicação pode ser baixo no MVP.

Faixa recomendada para planejamento:

- `R$ 0 a R$ 300/mês` de custo incremental se o ambiente atual absorver o módulo;
- `R$ 60 a R$ 120/mês` em uma VM cloud pequena adicional, se decidirem isolar a app de mentoria;
- `R$ 100 a R$ 250/mês` numa VM mais folgada para isolar app pública + workers, dependendo do sizing.

## Referência externa opcional

Pesquisei Hetzner para caso vocês queiram isolar:

- `CAX21`: `€ 7,99/mês` sem VAT
- `CAX31`: `€ 15,99/mês` sem VAT

Fonte:

- https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/

## Leitura prática

Se o tráfego inicial não for absurdo, a infra de aplicação quase certamente não será o problema financeiro.

## 12. Custos recorrentes resumidos

## Cenário Enxuto

- vídeo: `US$ 80 a US$ 120/mês`
- app incremental: `R$ 0 a R$ 150/mês`
- gateway: variável por venda

Perfil:

- lançamento inicial
- até ~100 alunos ativos

## Cenário Intermediário

- vídeo: `US$ 180 a US$ 260/mês`
- app incremental: `R$ 100 a R$ 250/mês`
- gateway: variável por venda

Perfil:

- operação funcionando
- ~300 alunos ativos

## Cenário Forte

- vídeo: `US$ 600 a US$ 900/mês`
- app incremental: `R$ 200 a R$ 500/mês`
- gateway: variável por venda

Perfil:

- escala relevante
- ~1.000 alunos ativos

## 13. Custo de implementação

## Esforço estimado do MVP

Aproveitando o stack atual e sem app mobile:

- fundação de schema/auth: `24-40h`
- admin de conteúdo: `32-48h`
- área do aluno + player: `40-60h`
- checkout + billing: `32-56h`
- webhooks + observabilidade + polimento: `24-40h`

Total estimado:

- `152h a 244h`

## Conversão para custo

Como a taxa interna/comercial pode variar, segue a conta por faixa:

### A R$ 150/h

- `R$ 22.800 a R$ 36.600`

### A R$ 250/h

- `R$ 38.000 a R$ 61.000`

### A R$ 350/h

- `R$ 53.200 a R$ 85.400`

## Leitura recomendada

Para um MVP bom, eu planejo mentalmente algo perto de:

- `R$ 30 mil a R$ 60 mil`

Isso é o intervalo mais honesto se vocês quiserem algo próprio, sério e ainda enxuto.

## 14. Payback contra Hotmart

Usando a economia de taxa por venda:

### Se o ticket for R$ 997

Economia aproximada por venda:

- `R$ 62,02` contra Stripe

Break-even da construção:

- build de `R$ 30 mil` => `484 vendas`
- build de `R$ 45 mil` => `726 vendas`
- build de `R$ 60 mil` => `968 vendas`

### Se o ticket for R$ 1.497

Economia aproximada por venda:

- `R$ 91,57` contra Stripe

Break-even da construção:

- build de `R$ 30 mil` => `328 vendas`
- build de `R$ 45 mil` => `492 vendas`
- build de `R$ 60 mil` => `656 vendas`

## Interpretação

Se o produto tiver volume e continuidade, o projeto tende a se pagar.

Se for um lançamento pequeno e pontual, pode não se pagar rápido.

## 15. Quando vale a pena

Vale a pena construir se:

- o produto vai vender continuamente;
- vocês querem controlar experiência e dados;
- vocês enxergam mais de um programa/mentoria ao longo do tempo;
- existe intenção de integrar o financeiro e o CRM;
- vocês aceitam operar produto próprio.

Não vale a pena construir agora se:

- o objetivo é apenas um lançamento pontual;
- a equipe quer terceirizar toda a complexidade operacional;
- afiliados e marketplace são parte central da estratégia já no primeiro ciclo.

## 16. Minha recomendação final

## Se o objetivo é lançar em julho com qualidade

Fazer:

1. `MVP próprio`
2. `Cloudflare Stream`
3. `Stripe` ou `Mercado Pago`
4. `Conta Azul` só depois da venda estabilizar

## Stack que eu escolheria hoje

### Opção recomendada

- app: `Next.js` no ecossistema atual do `Projete`
- vídeo: `Cloudflare Stream`
- pagamento: `Stripe`
- financeiro posterior: `Conta Azul`

### Opção Brasil-first

- app: `Next.js`
- vídeo: `Cloudflare Stream`
- pagamento: `Mercado Pago`
- financeiro posterior: `Conta Azul`

## Veredito

`Sim, eu faria.`

Mas eu faria como `plataforma própria enxuta de mentoria`, e não como “uma Hotmart nova”.

Esse é o ponto que preserva prazo, margem e sanidade técnica.
