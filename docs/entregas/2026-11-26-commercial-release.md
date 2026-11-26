# Projete — pacote comercial de 26/11/2026

## Escopo

- Vendedores encaminham seus leads para Aprovação e registram perda/cancelamento com motivo. Fechamento e reversão de venda continuam restritos à gestão.
- Home contabiliza Churn e identifica a unidade como clientes por CNPJ. A pontuação do documento não duplica o cliente. BI contabiliza oportunidades por emenda e valores negociados; perdas não compõem o pipeline aberto.
- O alias legado `Cancelado` é apresentado como Churn. Nenhum registro histórico foi reclassificado no banco nesta entrega.
- WhatsApp permite visualizar a fila sem projeto, assumir atendimento e iniciar conversa por telefone, mantendo as permissões de conversas atribuídas. Exibe cartões de contato, reações, respostas citadas e emojis.
- WhatsApp e Meu Dia permitem concluir atendimento. Uma nova mensagem recebida reabre a pendência; a conclusão exige a versão da mensagem que o consultor visualizou.
- Propostas enviadas pelo Workspace recebem cópia para o destinatário configurado no servidor; o padrão é `comercial@projetus.org`. Envios diretamente pelo Gmail não são abrangidos.
- BI oferece consulta de atividade diária no horário de Brasília. Ligações manuais são identificadas como tais; VoIP e envio automático pelo Slack não foram ativados.

## Validação anterior à publicação

- Build de produção aprovado em 26/11.
- 76 testes unitários direcionados, 14 regressões do Workspace e 6 testes HTTP aprovados, sem skips (96 testes distintos).
- Testes HTTP usam autenticação real, PostgreSQL local isolado e Evolution simulado. Cobrem permissões, disputa por atendimento, conclusão e reabertura, concorrência de mensagens, contatos encaminhados, reações, perdas e indicadores.
- Backup das tabelas afetadas concluído em `btdb`, em diretório restrito, antes da migração.
- Migração aditiva `20261117_commercial_attendance.sql` aplicada em produção antes da troca da aplicação: quatro colunas no atendimento, três campos de perda e dois índices. Sem remoção de mensagens, alteração de responsáveis ou reclassificação de status.

## Publicação e aceite

O destino é o aplicativo Coolify `ohxmnamg1umgut184jgi2o57`, branch `main`, base `/web`, em `btapps`, com banco `projetus_hub` em `btdb`. A comprovação exige fila concluída no commit publicado, imagem em execução e respostas da URL canônica `https://projete.projetus.org`.

O aceite da equipe com mensagens reais permanece necessário para cartões antigos que perderam conteúdo e para observar as desconexões do WhatsApp. Esta entrega não dispara reimportação histórica, não reconecta o telefone e não ativa VoIP, Meta AI, plano Meta Verified ou Hotmart.
