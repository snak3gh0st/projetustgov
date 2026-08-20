# S4 — Estrutura operacional v1

Entrega prevista: 25/08 → 05/09 (~10 dias úteis)

## O que entrou

- `/operacao` como fila operacional única com os painéis **Execução** e **Prestação de contas**.
- Etapa operacional derivada da situação do TransfereGov: `Aguardando execução`, `Em execução`, `Prestação de Contas`, `Concluído` e `Atenção`.
- Visão comercial na mesma linha: status do CRM, tipo de serviço, vendedor e valor de venda.
- Área v1 por proponente/convênio com:
  - histórico de situação do TransfereGov;
  - checklist operacional;
  - status de documentos;
  - prazo, valores e link direto para o convênio no TransfereGov.

## Fonte e responsabilidade dos dados

`projetos_execucao` continua sendo a fonte dos fatos governamentais. Ela é alimentada pelo `sync-execucao` e carrega `synced_at`; a tela exibe o último `cron_sync_log` desse sync.

As tabelas `operacao_checklists`, `operacao_documentos` e `operacao_eventos` são somente um overlay de trabalho humano. Elas não substituem, corrigem ou sobrescrevem situação, valores, prazos ou histórico do TransfereGov. Um checklist/documento só pode ser salvo quando o convênio existe na fonte sincronizada.

## Permissões

- Leitura: administração, CRM, CSM e perfis de execução/prestação.
- Escrita do overlay: administração e coordenação/assistência de execução ou prestação.
- Comercial continua vendo a conexão com a venda, sem ganhar permissão para alterar o fato TGov.

## Critério de aceite S4

O fluxo principal da operação deixa de depender da planilha Drive: o time abre `/operacao`, escolhe Execução ou Prestação, identifica o gap por etapa/checklist/documentos, abre o convênio e acompanha a evolução na mesma área.

## Validação local

- `npm run build` concluído com sucesso.
- `git diff --check` sem erro.
- Avisos restantes são preexistentes em login, contatos, sidebar e execução antiga; não bloqueiam a compilação.

## Gate antes de produção

Aplicar o DDL idempotente da primeira abertura da área em uma base autorizada e validar com um usuário de cada perfil, um convênio em execução e um convênio em prestação. A aceitação live ainda exige observar o sync real e confirmar que o histórico retornado corresponde ao TransfereGov, sem usar o build como prova de deploy ou dado atualizado.
