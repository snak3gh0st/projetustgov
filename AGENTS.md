# Projete: operação e publicação

- Produção usa **Coolify**, no host SSH `btapps`; banco PostgreSQL em `btdb`. A URL canônica é `https://projete.projetus.org`.
- Leia `docs/infra/CURRENT_INFRA.md` antes de qualquer publicação. O Coolify acompanha `main`, com base de build `/web`.
- Railway e Vercel são legados. Não publique por eles, não use seus checks como bloqueadores e não os apresente como requisitos para liberar a Projete.
- Confirme publicação pelo commit da fila do Coolify, imagem em execução e comportamento na URL canônica. Push e merge, isoladamente, não comprovam publicação.
- Preserve alterações locais do usuário. Credenciais e arquivos `.env.local` não entram em commits; nunca imprima valores de segredos.
- Hotmart continua pendente até confirmação das credenciais, produtos e modalidade das vendas. Esta publicação não ativa Hotmart nem altera os envios financeiros existentes.

Superpowers são opcionais: não invoque automaticamente para mudanças pequenas ou médias; não delegue trabalho que possa ser concluído sequencialmente. Use validação proporcional ao risco e preserve as instruções explícitas do usuário.
