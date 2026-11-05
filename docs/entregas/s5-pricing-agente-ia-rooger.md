# S5 - Pricing do agente de IA para Rooger

Status: documento para decisao. **Sem automação habilitada.**

Data-base da pesquisa: 28/09/2026. Moeda dos provedores: USD. Valores nao incluem impostos, cambio, desenvolvimento, suporte, numero telefonico, BSP ou plataforma multicanal.

## Resumo executivo

O custo de modelo para uma triagem curta e textual tende a ser pequeno diante do custo da plataforma WhatsApp/BSP e da operacao. O piloto deve ser aprovado pelo risco e pelo processo, nao apenas pelo custo de tokens.

Modelo de referencia para estimativa: GPT-6 Luna em processamento standard, com tarifa oficial publicada em 22/09/2026 de US$ 0,10 por 1 milhao de tokens de entrada e US$ 0,50 por 1 milhao de tokens de saida. Cached input nao foi usado na conta para manter a estimativa conservadora.

## Fonte oficial

- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- OpenAI API changelog com o lancamento e tarifa do GPT-6 Luna: https://developers.openai.com/api/docs/changelog
- Privacidade de dados empresariais/API: https://openai.com/business-data/
- Meta - WhatsApp Business Platform pricing: https://developers.facebook.com/docs/whatsapp/pricing/
- Meta - templates e Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/

Observacao de verificacao: a documentacao da Meta respondeu com limite HTTP 429 durante esta coleta. Por isso nenhuma tarifa brasileira de mensagem foi copiada como valor confirmado. O responsavel pela conta deve registrar a tarifa vigente exibida no rate card/Business Manager antes do go-live.

## Premissas

- Uma interacao de triagem usa, em media, 3.000 tokens de entrada e 500 tokens de saida.
- Nao ha voz, imagem, busca web ou ferramenta paga nestes cenarios.
- A conta adiciona 25% de contingencia para retries, system prompt e variacao de resposta.
- O agente apenas classifica e sugere proximo passo; nao envia mensagem nem altera ownership sozinho.
- A janela gratuita, categorias de template e tarifas Meta nao sao presumidas como zero.
- Custos de BSP/plataforma multicanal, numero, impostos e cambio ficam em linhas separadas.

Formula mensal do modelo:

`C_IA = ((interacoes x 3.000 / 1.000.000) x US$ 0,10 + (interacoes x 500 / 1.000.000) x US$ 0,50) x 1,25`

Formula do canal:

`C_Meta = soma(mensagens por categoria x tarifa Brasil vigente da categoria)`

Formula total:

`C_total = C_IA + C_Meta + C_BSP/plataforma + C_infra_incremental + impostos/cambio`

## Cenário baixo

| Componente | Premissa | Estimativa mensal |
|---|---:|---:|
| Interacoes IA | 1.000 | - |
| Tokens de entrada | 3,0 milhoes | US$ 0,30 |
| Tokens de saida | 0,5 milhao | US$ 0,25 |
| IA com contingencia de 25% | formula acima | **US$ 0,69** |
| Meta/WhatsApp | rate card Brasil a confirmar | Nao estimado |
| BSP/plataforma | fornecedor nao escolhido | Nao estimado |

## Cenário base

| Componente | Premissa | Estimativa mensal |
|---|---:|---:|
| Interacoes IA | 5.000 | - |
| Tokens de entrada | 15,0 milhoes | US$ 1,50 |
| Tokens de saida | 2,5 milhoes | US$ 1,25 |
| IA com contingencia de 25% | formula acima | **US$ 3,44** |
| Meta/WhatsApp | rate card Brasil a confirmar | Nao estimado |
| BSP/plataforma | fornecedor nao escolhido | Nao estimado |

## Cenário alto

| Componente | Premissa | Estimativa mensal |
|---|---:|---:|
| Interacoes IA | 20.000 | - |
| Tokens de entrada | 60,0 milhoes | US$ 6,00 |
| Tokens de saida | 10,0 milhoes | US$ 5,00 |
| IA com contingencia de 25% | formula acima | **US$ 13,75** |
| Meta/WhatsApp | rate card Brasil a confirmar | Nao estimado |
| BSP/plataforma | fornecedor nao escolhido | Nao estimado |

## Itens que Rooger precisa cotar/confirmar

1. Numero oficial e conta WhatsApp Business que serao usados.
2. Tarifa Brasil vigente por categoria de mensagem aplicavel ao fluxo.
3. BSP ou plataforma multicanal, mensalidade, markup por mensagem e limite de operadores.
4. Volume mensal esperado de contatos, percentual fora da janela de atendimento e templates necessarios.
5. Owner do budget e limite mensal com alerta/bloqueio.

## Go/no-go

Nenhum webhook, roteamento, triagem automatica ou envio deve entrar em producao ate todos os itens abaixo estarem aprovados:

- [ ] Provedor/BSP e numero oficial escolhidos.
- [ ] Rate card Brasil e custo total dos tres cenarios preenchidos.
- [ ] Base legal, opt-in, opt-out e politica de retencao aprovados.
- [ ] Templates aplicaveis aprovados pela Meta.
- [ ] Escopo de dados enviado ao modelo aprovado, sem segredo ou documento desnecessario.
- [ ] Owner de budget e teto mensal definidos.
- [ ] Amostra de referencia e criterio de qualidade da triagem definidos.
- [ ] Fallback humano, kill switch e owner de rollback definidos.
- [ ] PoC executada em ambiente controlado, sem contato externo automatico.

## Registro de decisao

| Campo | Registro |
|---|---|
| Decisao | [ ] Go para PoC controlada  [ ] No-go  [ ] Revisar premissas |
| Rooger | |
| Paulo | |
| Data | |
| Budget aprovado | |
| Plataforma escolhida | |
| Observacoes | |

Enquanto este registro estiver vazio, S5 permanece futura e sem compromisso de producao.
