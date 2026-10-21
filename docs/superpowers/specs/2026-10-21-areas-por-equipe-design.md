# PROJETE: uma área por equipe (nova organização de UI/UX)

Data: 21/10/2026 · Autor: Paulo (com Claude) · Status: aguardando aprovação

## Por que

O PROJETE nasceu como uma visão estratégica ampla (criada pelo Tito): um menu único, agrupado por tipo de tela, onde cada perfil vê uma fatia. A reunião com o Rooger (out/2026) pediu o contrário: organizar por área. O comercial precisa de um projeto 100% comercial, o financeiro de uma visão separada, consultores de uma visão enxuta e gestores de mais dados. Ao mesmo tempo vem o multicanal (WhatsApp não oficial, Gmail, Slack, Meet no card do lead), que precisa de um lugar natural para morar.

A resposta é reorganizar o app em **áreas, uma por equipe**, com a mesma marca (logo PROJETE, azul Sigma #0072F7, navy) e a fundação visual já aprovada (tokens, tipografia, motion da branch `snak3gh0st/ui-redesign-fase1`).

## Objetivos

1. Cada pessoa entra direto na área da sua equipe e só vê o que é do trabalho dela.
2. O consultor comercial começa o dia por uma lista do que fazer ("Meu dia"), não por um painel de números.
3. O card do lead vira o lugar único onde está tudo sobre o lead: dados, emendas, contatos, histórico e, quando as integrações chegarem, todas as conversas e a reunião.
4. A estrutura já nasce com os espaços do multicanal, para que cada integração entre sem reorganizar telas de novo.

## Não objetivos

- Construir as integrações (WhatsApp/Evolution API, Gmail, Slack, Google Meet). Cada uma é um projeto próprio, com design e plano próprios, depois deste.
- Mudar regras de negócio: comissão, distribuição, status, sincronização do TransfereGov continuam como estão.
- Inventar métricas novas. Telas usam dados que já existem.
- Redesenhar por dentro, nesta etapa, as telas de Operação TransfereGov, Financeiro e CSM. Elas mudam de lugar (área) e herdam a fundação visual; o redesenho interno vem depois.

## Antiobjetivos (seria fracasso mesmo funcionando)

- Alguém perder acesso a uma tela que usa hoje.
- Consultor ver comissão ou números da equipe.
- Seções vazias do tipo "em breve" ou listas falsas de conversas/reuniões antes de a integração existir.
- Links e favoritos atuais quebrarem (ex.: `/leads`, `/execucao?fase=...`, `/lead/<cnpj>`, `/tgov/...`, `/financeiro`).
- Esconder no menu ser tratado como segurança. A autorização continua nas páginas e APIs (`lib/dal.ts`), como hoje.

## Restrições

- Stack atual: Next.js 14 (app router) em `web/`, next-auth v5, Postgres `projetus_hub`, Tailwind com os tokens OKLCH da fase 1, `motion/react` com `LazyMotion` estrito e `MotionConfig reducedMotion="user"`.
- Mesma marca e cores. Produto (register "product"): cor contida, movimento só para mostrar mudança de estado (150 a 280 ms), sem travessão em textos, sem borda lateral colorida, sem texto em gradiente.
- Funcionar em desktop e no celular (375 px).
- Toda mudança de banco em produção precisa de OK explícito do Paulo antes de rodar. Deploy também, um por um.
- A branch da fase 1 está empilhada sobre o PR #40 (funil de Prestação de Contas); o #40 precisa entrar antes.

## Decisões tomadas

### Áreas e quem entra em cada uma

Perfis existentes em `users.role`; usuários ativos hoje com papel de gestão: Rooger (gestor), Philipe (gestor), Tito (gestor), Thiago (gestor_financeiro), Admin (admin).

O Rooger é **gestor comercial**, não gestor da empresa. O papel `gestor` passa a significar exatamente isso (gestor do Comercial, CSM e Produtos Digitais). Gestores da empresa são Philipe e Tito (área Gestão).

| Área | Quem tem como área principal | Telas |
|---|---|---|
| **Comercial** (Rooger) | vendedor, coordenador, gestor comercial (Rooger), csm, visualizador | Meu dia · Pipeline (do consultor) / Pipeline da equipe (gestor) · Conversas (quando houver canal) · Leads (abas Aprovação, Execução, Prestação) · Distribuir leads ¹ · Comissões ¹ · BI comercial ¹ · CSM · Produtos Digitais |
| **Operação TransfereGov** | projetista, coord_aprovacao, assistente_aprovacao, coord_execucao, assistente_execucao, coord_prestacao, assistente_prestacao, adm_produto | Operação · Pipeline de instrumentos · Painel de instrumentos · Análises de instrumentos · Usuários TGov (coordenadores e adm_produto) |
| **Financeiro** | gestor_financeiro | BI Financeiro · Conta Azul · Comissões a pagar |
| **Gestão** (Philipe e Tito) | diretoria | Visão geral (nova) · BI comercial · BI CSM · BI Financeiro · Análises de instrumentos |
| **Administração** | admin | Usuários · Saúde do sistema |

¹ só gestor e coordenador, como hoje (Comissões só gestor).

Regras:
- **Ninguém perde acesso.** O conjunto de telas que cada perfil acessa hoje (`getNavItemsForRole` em `web/src/lib/sidebar-nav-items.ts`) é preservado; as áreas só reagrupam. Quem hoje vê telas de mais de uma área ganha acesso às áreas correspondentes (ex.: gestor e admin veem todas; csm vê Comercial e Operação; adm_produto vê Operação e Produtos Digitais no Comercial).
- **Área principal** define para onde a pessoa vai ao entrar e o que `/` mostra.
- **Troca de área** por uma barra fina escura à esquerda (ícones das áreas). Só aparece para quem tem mais de uma área. No celular, a troca fica no topo do menu (drawer).
- Philipe e Tito hoje têm papel `gestor`, igual ao Rooger. Para separar a área Gestão do Comercial, eles precisam de um papel próprio (nome sugerido: `diretoria`), com acesso a todas as áreas e Gestão como principal. Isso exige alterar a constraint `users_role_check`, o tipo `Role` em `lib/dal.ts` e as checagens de permissão que hoje aceitam `gestor` (diretoria deve passar onde gestor passa, salvo comissão; ver pergunta aberta). A atualização dos dois usuários em produção precisa de OK do Paulo.

### Comercial: tela inicial do consultor ("Meu dia")

Primeira tela de vendedor (e de coordenador quando estiver vendendo; ver "deixado ao construtor"). Uma lista do que fazer hoje, de cima para baixo:

1. **Reuniões de hoje**: com botão "Entrar no Meet". *Só aparece quando a integração do Meet existir.*
2. **Esperando sua resposta**: mensagens de WhatsApp, emails e menções no Slack sem resposta, numa lista só com o canal marcado. *Só aparece quando houver ao menos um canal integrado.*
3. **Novos leads para você**: leads atribuídos a ele recentemente e ainda em "Não Contatado".
4. **Leads parados**: leads dele sem contato há mais de 7 dias (`days_since_last_contact`, já calculado em `/api/leads`), fora dos desfechos (fechado, sem interesse, churn).
5. **Reunião agendada**: leads dele com status "Reunião Agendada" (até o Meet existir, sem horário).

Vale para os três funis (Aprovação usa `status_contato`; Execução e Prestação usam `status_contato_execucao`). Cada item mostra a qual funil pertence.

Comportamento:
- Clicar num item abre o card do lead.
- O item sai da lista quando deixa de cumprir a regra (mudou de status, foi contatado). A lista esvazia ao longo do dia; lista vazia mostra uma mensagem de "tudo em dia", não um vazio cinza.
- Sem comissão, sem números da equipe.

### Comercial: tela inicial do gestor ("Pipeline da equipe")

É a tela inicial já redesenhada e aprovada na fase 1 (`web/src/app/HomeClient.tsx`): sincronização no topo, abas Aprovação/Execução/Prestação, funil, desempenho por vendedor e atividade recente atualizando a cada minuto. Exatamente o que a nota da reunião pede. Comissão só para o gestor, como hoje. Quando houver canal integrado, ganha um bloco "conversas sem resposta por consultor".

### Comercial: Leads

Os três itens de menu atuais (Leads de aprovação, de execução, de prestação de contas) viram **uma página "Leads" com três abas**. Por dentro, cada aba continua usando o que já existe (`LeadsClient` para Aprovação, `ExecucaoClient` com `fase` para Execução e Prestação), com a fundação visual aplicada (tabela, pílulas de status, skeleton, toasts no lugar de `alert()`). URLs antigas continuam funcionando (redirecionam para a aba certa).

### Card do lead

`/lead/[cnpj]` passa a ser o lugar único do lead:

- **Cabeçalho**: nome, CNPJ, município/UF, status (editável por quem pode hoje), responsável.
- **Centro, linha do tempo única**: mudanças de status e atribuição (`lead_events`), notas de contato (`contact_notes`) e, quando as integrações chegarem, mensagens de WhatsApp, emails e threads do Slack. Filtros por tipo (Tudo, WhatsApp, Email, Slack, Notas). Caixa de resposta embaixo: hoje adiciona nota; com canais, escolhe o canal e envia dali.
- **Direita**: próxima reunião (com o Meet: horário e "Entrar no Meet", inclusive para o gestor sem convite; antes disso, o botão "Agendar" que já existe), emendas do CNPJ com fase, contatos (`lead_contacts`), comissão só quando a regra atual permitir.
- O painel lateral rápido (`LeadSlideOver`) continua para espiar da lista, com link para o card completo.

### Comercial: Conversas

Item de menu que **só aparece quando houver ao menos um canal integrado**. Caixa unificada (lista de conversas à esquerda, conversa no centro, resumo do lead à direita). O consultor vê as conversas dos leads dele; o gestor vê as de todos. Fica definido aqui só o lugar e a forma; o funcionamento é do projeto de cada integração.

### Gestão: Visão geral

Tela inicial de Philipe e Tito. Um resumo por área, cada bloco com poucos números que já existem nas APIs atuais e um link para o BI daquela área: Comercial (funil e vendas, de `/api/dashboard-crm`), Operação TransfereGov (instrumentos por situação, das APIs de `/tgov`), Financeiro (do BI Financeiro), CSM (do BI CSM). Sem métrica nova.

### Estrutura visual (shell)

- Barra de áreas (fina, navy, só ícones com rótulo no hover/foco) + menu da área atual (nome da área no topo, itens, seção "Gestão" para itens de gestor) + topo com busca e sino.
- A fundação da fase 1 continua: tokens OKLCH, Inter/Space Grotesk, primitivas em `web/src/components/ui`, indicador animado no menu, toasts, skeletons, `prefers-reduced-motion`.
- Celular: menu em drawer com o seletor de área no topo.

## Entrega em etapas

Cada etapa é um PR, com tsc, lint, build e capturas em claro, escuro e 375 px. Comissão conferida (só gestor) em cada uma.

1. **Shell de áreas**: mapa área × perfil, barra de áreas, menu por área, `/` levando à tela inicial da área principal. Inclui o papel `diretoria` (migração preparada, aplicada em produção só com OK).
2. **Leads com abas** e restyle da lista e do painel lateral.
3. **Meu dia** com os dados que já existem (itens 3 a 5).
4. **Card do lead** com linha do tempo e coluna direita.
5. **Gestão: Visão geral**.
6. Depois, um projeto por integração, nesta ordem: WhatsApp (número de consultorias), Gmail, Slack, Meet. Cada um acende os espaços já previstos (Meu dia itens 1 e 2, Conversas, linha do tempo, reunião no card).

## Decisões do autor após revisão (conferir)

- **Nome**: "hub" foi descartado; as divisões se chamam **áreas** (Área Comercial, Operação TransfereGov, Financeiro, Gestão, Administração).
- **Diretoria e o papel gestor**: em produção, Philipe e Tito não são donos nem closers de nenhum lead e não distribuíram leads. Por isso `diretoria` pode passar onde `gestor` passa para acesso sem alterar somas de comissão, rankings ou listas de vendedores. Cada checagem de `'gestor'` ligada a comissão é revista uma a uma conforme a resposta sobre comissão da diretoria.
- **Tela solta de outra área**: quando um perfil acessa só uma ou duas telas de outra área (ex.: vendedor e `/operacao`, gestor financeiro e `/bi`), a tela aparece no menu da área principal dele, não como uma área a mais. A barra de áreas só aparece para quem tem acesso real a mais de uma área (diretoria, admin, csm, adm_produto e, conforme resposta abaixo, o gestor comercial).
- **Card do lead com vários projetos no mesmo CNPJ**: o cabeçalho mostra só dados do CNPJ (nome, CNPJ, município/UF) e o(s) responsável(is). O status fica por projeto, na seção de emendas/projetos, cada um com o funil a que pertence e o controle de status que já existe hoje para ele (Aprovação por linha de `vendedor_projetos`; Execução/Prestação por CNPJ).

## Deixado ao construtor

- Como guardar a área atual quando a mesma tela pertence a duas áreas (ex.: Comissões no Comercial e no Financeiro; BI comercial no Comercial e na Gestão): cookie, parâmetro ou preferência; o padrão é a área principal.
- Endpoint e consulta do "Meu dia" (um endpoint novo agregando as listas é o caminho esperado); janela exata de "recente" para novos leads.
- Se o coordenador abre no "Meu dia" ou no "Pipeline da equipe" (sugestão: Pipeline da equipe, com "Meu dia" no menu).
- Ícones das áreas, microcopy e estados vazios, dentro das regras de cópia do produto.
- Como unificar a página de Leads por dentro (wrapper com abas sobre os componentes atuais é o caminho mais curto).

## Perguntas abertas (para o Paulo/Rooger)

- Philipe e Tito (diretoria) veem comissão? A nota diz "visível apenas para gestor comercial, não para toda a empresa".
- O gestor financeiro (Thiago) continua vendo Comissões? Hoje vê; no desenho fica como "Comissões a pagar" na área Financeiro.
