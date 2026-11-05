# Onboarding por area - CRM e Operacao

Objetivo: permitir que cada area use o fluxo principal sem depender de planilha paralela ou de suporte para tarefas rotineiras.

## Regras comuns

- Entre sempre com sua conta individual; nao compartilhe sessao.
- Nao copie dados pessoais para documentos, tickets ou capturas fora dos canais autorizados.
- A situacao, valores e prazos do TransfereGov sao fatos sincronizados e nao podem ser corrigidos pelo checklist local.
- Checklist, documentos e eventos da Operacao sao um overlay humano; divergencia com o TGov deve ser escalada, nao sobrescrita.
- Erro de permissao deve ser tratado pelo owner de acesso. Nao contorne usando conta de outra area.

## Comercial

**Perfis:** `vendedor`, `coordenador`, `visualizador`, com supervisao de `gestor`/`admin`.

- Entrada: `/leads` e pipeline `/`.
- Pode: atualizar o funil conforme a permissao do perfil, registrar historico, abrir WhatsApp do contato, usar o deep-link de agenda e consultar `/operacao`.
- Nao pode: alterar fatos TGov, checklist operacional ou status documental.
- Evidencia esperada: contato e mudanca de funil aparecem no historico; venda fechada carrega valor e tipo de servico.
- Escalacao: coordenador comercial; para regra/permissionamento, gestor/admin.

## Execucao

**Perfis:** `coord_execucao` e `assistente_execucao`.

- Entrada: `/operacao` no painel Execucao; detalhe governamental em `/tgov?view=dashboard&tab=execucao`.
- Pode: ler fatos sincronizados, atualizar checklist e status documental do overlay, consultar historico.
- Nao pode: editar valor/prazo/situacao TGov nem alterar funil comercial.
- Evidencia esperada: atualizacao gera evento operacional e permanece separada do historico TGov.
- Escalacao: coordenacao de Execucao; divergencia de fonte para `adm_produto`/gestor.

## Prestacao de Contas

**Perfis:** `coord_prestacao` e `assistente_prestacao`.

- Entrada: `/operacao` no painel Prestacao de Contas; detalhe em `/tgov?view=dashboard&tab=prestacao_contas`.
- Pode: atualizar checklist e status documental dos convenios em prestacao.
- Nao pode: escrever em abas de Aprovacao/Execucao fora do escopo nem alterar fato sincronizado.
- Evidencia esperada: itens pendentes, rejeitados ou em analise ficam visiveis na fila e no detalhe.
- Escalacao: coordenacao de Prestacao; divergencia de fonte para `adm_produto`/gestor.

## CSM

**Perfil:** `csm`.

- Entrada: `/csm`, `/csm/bi` e leitura de `/operacao`.
- Pode: acompanhar carteira, contatos, projetos e andamento operacional.
- Nao pode: alterar checklist/documentos da Operacao nem fatos TGov.
- Evidencia esperada: a mesma organizacao apresenta dados comerciais, projetos e fase operacional coerentes.
- Escalacao: gestor/admin para ownership; area operacional responsavel para pendencias de execucao/prestacao.

## Gestao e administracao

**Perfis:** `gestor` e `admin`; `adm_produto` administra o dominio TGov sem herdar toda autoridade comercial.

- Entrada: todas as superficies aplicaveis, incluindo `/operacao`, `/tgov`, distribuicao e usuarios.
- Pode: supervisionar filas, distribuir ownership, corrigir acesso e, para gestor/admin, atualizar o overlay operacional.
- Nao deve: editar diretamente fatos sincronizados para mascarar divergencias de fonte.
- Evidencia esperada: owners, pendencias e excecoes possuem responsavel e trilha de auditoria.
- Escalacao tecnica: BTerminal; incidente de fonte deve incluir rota, horario, sync observado e referencia sem PII.

## Roteiro de primeiro acesso

1. Confirmar que o menu mostra somente as areas do seu papel.
2. Abrir um registro de treinamento autorizado.
3. Identificar qual informacao vem do CRM, qual vem do TGov e qual e overlay operacional.
4. Executar uma acao permitida e confirmar a evidencia correspondente.
5. Tentar somente a verificacao de bloqueio prevista no roteiro de aceite; nao testar em dados reais sem autorizacao.
6. Registrar duvida ou falha com horario, rota, papel e resultado, sem anexar PII.
