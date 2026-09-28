# Mapa de ownership - CRM e Operacao

Este mapa descreve a autoridade implementada. Os gates de codigo ficam em `web/src/lib/dal.ts`; middleware e rotas podem restringir ainda mais cada perfil.

| Dominio | Fonte de verdade | Leitura | Escrita | Owner operacional | Escalacao |
|---|---|---|---|---|---|
| Leads e funil comercial | `vendedor_projetos` | Comercial, gestao e perfis explicitamente liberados | Vendedor/coordenador dentro do proprio escopo; gestor/admin nas acoes de gestao | Coordenacao comercial | Gestor/admin |
| Contatos e historico comercial | `lead_contacts`, `contact_notes` | Comercial e gestao conforme ownership | Comercial autorizado | Coordenacao comercial | Gestor/admin |
| Fatos TransfereGov | `propostas`, `projetos_execucao`, tabelas TGov | Gates `canReadTgov` | Somente sync; mutacoes auxiliares usam `canWriteTgov` | `adm_produto` e coordenacoes TGov | Gestor/admin e BTerminal para incidente tecnico |
| Fila operacional | Fatos TGov + overlay local | Gate `canReadOperacao` | Sem escrita direta na fila | Coordenacoes de Execucao/Prestacao | Gestor/admin |
| Checklist operacional | `operacao_checklists` | Gate `canReadOperacao` | Gate `canWriteOperacao` | Execucao ou Prestacao conforme fase | Gestor/admin |
| Status de documentos | `operacao_documentos` | Gate `canReadOperacao` | Gate `canWriteOperacao` | Execucao ou Prestacao conforme fase | Gestor/admin |
| Eventos operacionais | `operacao_eventos` | Gate `canReadOperacao` | Gerado pelas atualizacoes autorizadas | Coordenacoes operacionais | Admin/BTerminal se faltar trilha |
| Carteira CSM | Rotas e tabelas CSM | Gate `canCsm`, gestor/admin | CSM nas rotas proprias | CSM | Gestor/admin |
| Alertas TGov e digest | Mudancas sincronizadas + preferencias de usuario | Destinatarios autorizados | Sync/cron e configuracao autorizada | Heads das areas | Gestor/admin; BTerminal para falha de entrega |
| WhatsApp | Telefone do contato + sessao WhatsApp do operador | Comercial autorizado | O CRM apenas abre `wa.me`; nao envia automaticamente | Rooger/comercial | Gestor e administrador da conta Meta |

## Gates atuais

- `canReadOperacao`: gestor, admin, adm_produto, CSM, comercial de leitura e perfis de Execucao/Prestacao.
- `canWriteOperacao`: gestor, admin, coordenacao/assistencia de Execucao e coordenacao/assistencia de Prestacao.
- `canReadTgov`: gestao, produto, CSM e perfis TGov definidos no codigo.
- `canWriteTgov`: gestao, produto e perfis operacionais autorizados; CSM e projetista nao recebem mutacao privilegiada.
- `canCsm`: CSM, gestor e admin.

## Principios de decisao

1. Dado governamental nao e corrigido pelo CRM; a fonte ou o sync deve ser investigado.
2. Overlay operacional nao muda status comercial automaticamente.
3. Mudanca de owner comercial nao transfere autoridade de escrita TGov.
4. Numero unico do WhatsApp e uma decisao de conta/sessao; o CRM nao declara validacao sem teste acompanhado.
5. Qualquer excecao permanente exige mudanca no gate de codigo, teste e registro neste mapa.
