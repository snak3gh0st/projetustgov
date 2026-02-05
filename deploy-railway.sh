#!/bin/bash
# Script de Deploy Rápido para Railway
# Execute este script após configurar o projeto no dashboard

echo "🚀 Deploy Rápido no Railway"
echo ""

# Verificar se está logado
railway whoami || exit 1

# Linkar ao projeto projetus-production
echo "🔗 Linkando ao projeto projetus-production..."
railway link --project 7ea1ae47-2d8e-414c-86d4-d8a0a9b9c302

echo ""
echo "📋 PASSOS MANUAIS NO DASHBOARD:"
echo "================================"
echo ""
echo "1. Acesse: https://railway.com/project/7ea1ae47-2d8e-414c-86d4-d8a0a9b9c302"
echo ""
echo "2. Adicione PostgreSQL:"
echo "   • Clique '+ New' → 'Database' → 'Add PostgreSQL'"
echo "   • Aguarde a criação (~30s)"
echo ""
echo "3. Crie serviço da API:"
echo "   • Clique '+ New' → 'Empty Service'"
echo "   • Nomeie: 'projetus-api'"
echo ""
echo "4. Configure o serviço:"
echo "   • Settings → Source"
echo "   • Selecione: 'GitHub Repo'"
echo "   • Escolha: este repositório"
echo "   • Root Directory: ./"
echo "   • Builder: Dockerfile"
echo "   • Dockerfile Path: Dockerfile.railway"
echo ""
echo "5. Configure variáveis:"
echo "   • Vá em Variables do serviço 'projetus-api'"
echo "   • Adicione:"
echo "     DATABASE_URL=\${{Postgres.DATABASE_URL}}"
echo "     TELEGRAM_BOT_TOKEN=seu_token_aqui"
echo "     TELEGRAM_CHAT_ID=seu_chat_id_aqui"
echo ""
echo "6. Configure Health Check:"
echo "   • Settings → Healthcheck"
echo "   • Path: /health"
echo "   • Timeout: 100s"
echo ""
echo "7. Deploy:"
echo "   • Clique 'Deploy'"
echo "   • Aguarde o build (~2 minutos)"
echo ""
echo "✅ Pronto! A URL será mostrada no dashboard."
