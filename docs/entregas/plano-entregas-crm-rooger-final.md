# Fechamento do plano de entregas - CRM e Operacional

Data da verificacao: 28/09/2026

Este registro separa quatro camadas: codigo, runtime implantado, banco/fonte e aceite humano. Uma camada nao serve como prova automatica da outra.

## Resumo

| Sprint | Codigo | Runtime de producao | Banco/fonte | Aceite humano |
|---|---|---|---|---|
| S1 - CRM e visibilidade | Implementado | Presente no commit de producao `3681f6a` | Colunas e dados consumidos pelo CRM | Pronto para aceite |
| S2 - avisos e agenda | Implementado | Digest e deep-link presentes no runtime | Cron protegido e timer systemd ativo | Monitorar recebimento real |
| S3 - WhatsApp e canais | Acao e estados implementados | `WhatsAppAction` presente no runtime | Nao altera banco nem envia mensagem | Numero unico e checklist Meta pendentes |
| S4 - estrutura operacional | `/operacao`, APIs e overlay implementados | Rota protegida publicada | Tabelas inicializadas; uso operacional ainda zerado | Teste por perfil e base Danilo pendentes |
| S5 - IA e multicanal | Nao habilitado por desenho | Nenhuma automacao nova | Nenhum webhook/roteamento aplicado | Pricing pronto; go/no-go pendente |

## Evidencia de codigo

- S1 e S2: commits `c6eea5b` e `955e3e6`.
- S3 e S4: commit `5ae7554`.
- Runtime observado no `btapps`: `SOURCE_COMMIT=3681f6a2af53cf285296e7ed30e6618368e4a058`.
- Branch de conclusao deste plano: inclui a correcao posterior que rejeita `kind` operacional desconhecido; essa correcao nao deve ser chamada de producao antes de novo deploy.

## Evidencia do runtime no btapps

- URL oficial: `https://projete.projetus.org`.
- `GET /operacao` sem sessao: HTTP 302 para `/login`.
- `GET /api/operacao` sem sessao: HTTP 401 com `{"error":"Unauthorized"}`.
- `projetus-cron@sync-leads.timer`: `enabled` e `active`.
- Ultimo disparo agendado observado: 28/09/2026 09:30:01 BRT.
- Servico agendado: finalizado em 09:31:25 com `status=0/SUCCESS`.
- Proximo disparo: 29/09/2026 09:30 BRT.

## Evidencia agregada do btdb

Consulta executada em transacao `BEGIN READ ONLY`, sem retornar PII.

| Tabela | Linhas | CNPJs distintos | Leitura |
|---|---:|---:|---|
| `projetos_execucao` | 17.804 | 2.877 | Fonte operacional TGov sincronizada |
| `operacao_checklists` | 89.020 | 2.877 | Catalogo inicializado; todos pendentes |
| `operacao_documentos` | 89.020 | 2.877 | Catalogo inicializado; todos pendentes |
| `operacao_eventos` | 0 | 0 | Nenhum uso/aceite operacional registrado ainda |

Conclusao: S4 esta tecnicamente implantada e preparada no banco, mas nao ha evidencia de operacao real do checklist/documentos. Nao confundir inicializacao com aceite.

## Fetching diario de leads

- O comportamento foi mantido sem alteracao.
- O timer diario de 09:30 BRT continua ativo no `btapps`.
- A execucao mais recente registrada em 28/09/2026 retornou 0 inseridos, 4.503 atualizados e 0 erros.
- A ausencia de lead novo significa que nenhuma chave elegivel nova apareceu no recorte 2026 + OSC; nao significa que o cron deixou de buscar.

## Pendencias de aceite S3

- [ ] Rooger registra o numero comercial oficial.
- [ ] Teste acompanhado confirma o remetente exibido.
- [ ] Conta, administradores, templates, opt-in/opt-out e janela de 24 horas sao confirmados.
- [ ] Registro em `s3-whatsapp-meta-api-checklist.md` recebe evidencia e decisao.

## Pendencias de aceite S4

- [ ] Um usuario de Execucao testa fila, detalhe e atualizacao permitida.
- [ ] Um usuario de Prestacao testa fila, detalhe e atualizacao permitida.
- [ ] Um perfil somente leitura confirma bloqueio de escrita.
- [ ] Historico de um convenio e comparado com o TransfereGov.
- [ ] Danilo ou delegado formal confirma a base, versao e campos obrigatorios.
- [ ] Registro em `s4-estrutura-operacional.md` recebe evidencia e decisao.

## Gate S5

O documento `s5-pricing-agente-ia-rooger.md` apresenta cenarios e formula. S5 permanece sem automacao ate haver decisao assinada sobre provedor, tarifa Meta, opt-in/base legal, templates, budget, qualidade, fallback humano e rollback.

## Decisao de encerramento

| Campo | Registro |
|---|---|
| Rooger - aceite S3 | [ ] Aceito [ ] Rejeitado [ ] Pendente |
| Danilo/delegado - base S4 | [ ] Aceita [ ] Requer ajuste [ ] Pendente |
| Operacao - aceite S4 | [ ] Aceita [ ] Rejeitada [ ] Pendente |
| S5 | [ ] Go para PoC [ ] No-go [ ] Pendente |
| Data | |
| Referencia da ata/evidencia | |
