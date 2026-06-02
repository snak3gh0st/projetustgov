---
task: hetzner-migration
status: in_progress
last_updated: 2026-06-02T14:15:00Z
---

<current_state>
Debugando build do carreirahubproject no Coolify (sigma-apps 135.181.89.138).
Deploy j124mlnluh4q99r4a9w4ymdm foi triggerado AGORA (2026-06-02 ~14:15 UTC) — AGUARDANDO RESULTADO.
</current_state>

<completed_work>
- ✅ Identificada a causa raiz do erro "Module not found: Can't resolve '@/lib/auth'"
  → Stale `.next/cache` BuildKit cache mount (não é limpado pelo force_rebuild!)
  → `docker builder prune -a -f` foi rodado e limpou TODOS os cache mounts (12.7GB)
  → Build manual simples NO SERVIDOR funcionou com sucesso após o prune
- ✅ Deploy j124mlnluh4q99r4a9w4ymdm triggerado após o prune
</completed_work>

<remaining_work>
1. Verificar resultado do deploy j124mlnluh4q99r4a9w4ymdm:
   curl -s "https://apps.sigmaintel.io/api/v1/deployments/j124mlnluh4q99r4a9w4ymdm" \
     -H "Authorization: Bearer 6|DG4Z0m4fOEzaO6MbUuFIvgMaB4bSpius2qdmm1Oc0a00a8ac" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["status"])'

2. SE SUCESSO:
   - Verificar health: curl https://apps.sigmaintel.io/api/health (via proxy ou direct)
   - Atualizar DNS Cloudflare: app.carreirausa.com A 135.181.89.138
   - Testar login em app.carreirausa.com
   - Atualizar memory (hetzner migration) para marcar carreirahubproject como DONE

3. SE AINDA FALHAR:
   - Verificar logs: SSH para 135.181.89.138, docker exec coolify-db psql com deployment UUID
   - Considerar remover `--mount=type=cache,target=/app/.next/cache` do Dockerfile
   - Commit a mudança do Dockerfile: cd ~/Dev/SigmaProjects/carreirahubproject

4. Após carreirahubproject OK → iniciar migração easquoteproj (#7)
   - Stack: FastAPI (Python) + Next.js frontend
   - Domínio: durval.ai
   - Projeto Coolify: tg4fx5pyd4r1gmrm86rlx5ct
   - GitHub: snak3gh0st/easquoteproj
</remaining_work>

<decisions_made>
- Causa do "Module not found": stale .next/cache BuildKit cache mount sobreviveu ao force_rebuild
- docker builder prune -a -f = limpeza total de TODOS os cache mounts no servidor
- Build manual com env vars mínimas FUNCIONOU → confirma que source code está OK
- Não modificar Dockerfile a menos que o próximo deploy também falhe
</decisions_made>

<blockers>
- Nenhum bloqueador atual — aguardando resultado do deploy j124mlnluh4q99r4a9w4ymdm
</blockers>

<context>
Coolify app: kffprhcmp1agcwrzdd0eq7ya
API token: 6|DG4Z0m4fOEzaO6MbUuFIvgMaB4bSpius2qdmm1Oc0a00a8ac
Base: https://apps.sigmaintel.io
SSH: root@135.181.89.138

Deploy anterior que funcionou manualmente:
  docker build --no-cache --build-arg DATABASE_URL=... -t carreirahub_test .
  Imagem: carreirahub_test:latest (537MB) no servidor

Lição aprendida: `force_rebuild: true` NÃO limpa `--mount=type=cache` mounts.
Apenas `docker builder prune` limpa. Para evitar recorrência: remover o .next/cache mount do Dockerfile.
</context>

<next_action>
1. Verificar status do deploy j124mlnluh4q99r4a9w4ymdm (pode ter concluído)
2. Se OK → DNS + test login
3. Se falhar → inspecionar logs e remover .next/cache mount do Dockerfile
</next_action>
