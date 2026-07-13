# Produtos Digitais: acesso comercial, contatos e sidecard

## Objetivo

Permitir que os comerciais consultem as OSCs do Produto Digital, mostrar o contato disponível por CNPJ e abrir os detalhes da entidade em um sidecard consistente com os demais níveis do Hub.

O Produto Digital continuará sendo uma superfície de consulta/prospecção. Alterações de status, observações ou contatos continuam nos fluxos de CRM existentes.

## Permissões

Criar uma única regra de leitura para Produto Digital, usada pela navegação, pela página e pela API. A regra permitirá:

- `gestor`
- `admin`
- `adm_produto`
- `csm`
- `vendedor`
- `coordenador`

`vendedor` e `coordenador` terão acesso amplo às OSCs MOSC, sem escopo automático por carteira, porque a tela é de descoberta de potenciais entidades. O acesso será somente leitura.

O item `Produtos Digitais` aparecerá no menu dos comerciais. A página e a API usarão a mesma função de autorização para evitar o caso de o item aparecer no menu mas retornar 403, ou o inverso.

## Dados da lista

A consulta atual de organizações será enriquecida sem alterar a cardinalidade de uma linha por CNPJ:

1. O contato principal será escolhido nesta ordem: `lead_contacts` principal com telefone/email, outro `lead_contacts` com telefone/email, `proponentes.email/telefone`, e por fim os campos de contato do staging MOSC.
2. A lista exibirá um resumo de contato por CNPJ, com telefone clicável para WhatsApp quando possível e email clicável.
3. A consulta usará subconsultas agregadas ou `LATERAL` para não duplicar OSCs por causa de múltiplos contatos.
4. O filtro de contato poderá separar `Todos`, `Com contato` e `Sem contato`.

## Filtros de interação

O pedido de filtrar a entidade que acessou/interagiu por último será representado pelos dados comerciais já existentes no Hub:

- entidade/responsável pelo último contato;
- faixa do último contato: `Nunca`, `até 7 dias`, `8–30 dias`, `31–90 dias`, `mais de 90 dias`.

O último contato será calculado pelo evento mais recente entre `contact_notes.created_at` e uma atualização comercial válida de `vendedor_projetos.updated_at` cujo status não seja `Não Contatado`. O responsável será o usuário associado ao evento mais recente. CNPJs sem histórico ficam em `Nunca` e sem responsável.

Se “acessou recurso” significar acesso técnico de usuário a uma página/recurso da plataforma, essa é uma métrica diferente e não será misturada com o último contato comercial.

## Sidecard

Ao clicar na linha ou no nome da OSC, o Produto Digital abrirá um sidecard lazy-loaded, com o padrão visual já usado pelo Hub:

- cabeçalho com razão social/nome fantasia e CNPJ;
- localização, situação cadastral, natureza jurídica e áreas MOSC;
- resumo do vínculo com CRM/proponentes;
- lista de contatos, incluindo nome, cargo, telefone, email e marcador de principal;
- ações rápidas de WhatsApp, telefone e email quando houver dados;
- estados de carregamento, erro, fechamento por backdrop e tecla Escape.

O sidecard terá um endpoint próprio de leitura por CNPJ, protegido pela mesma regra de Produto Digital. Ele não dependerá dos endpoints de contatos do CRM que aplicam escopo de carteira, pois os comerciais precisam consultar OSCs fora de suas carteiras.

## Abordagens consideradas

### Recomendada: endpoint próprio + sidecard próprio

Adicionar `GET /api/produtos-digitais/[cnpj]` e um componente `ProdutosDigitaisSideCard`. É a opção mais segura para combinar MOSC, proponentes, contatos e CRM sem acoplar o Produto Digital às regras de detalhe de leads ou de CSM.

### Reutilizar `CsmSideCard`

Reduz código visual, mas mistura semântica de cliente CSM, projetos de execução e autorização de CSM com uma OSC MOSC que pode ainda não ser cliente. Não é recomendado.

### Embutir todos os contatos na resposta da lista

Evita uma chamada ao clicar, mas aumenta a resposta de uma tela que pode consultar muitos CNPJs e duplica dados de contatos em cada refresh. Não é recomendado.

## Validação

- verificar que `vendedor` e `coordenador` veem o item no menu e recebem dados da API;
- verificar que papéis sem permissão continuam recebendo acesso negado;
- verificar filtros de contato e último contato sem duplicar CNPJs;
- verificar sidecard com CNPJ no CRM, fora do CRM, com múltiplos contatos e sem contato;
- executar lint/build do `web`;
- validar a rota real após deploy quando o ambiente de banco/runtime estiver disponível.
