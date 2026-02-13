#!/bin/bash

export PYTHONPATH="$(pwd):$PYTHONPATH"

echo "🔍 Verificando estado da tabela proponentes..."
echo ""

# Verificar quantos proponentes existem e quantos têm contatos
python3 << 'PYEOF'
import sys
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)) or '.')

from sqlalchemy import text
from src.loader.database import get_engine

try:
    engine = get_engine()
    
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as with_email,
                COUNT(CASE WHEN telefone IS NOT NULL AND telefone != '' THEN 1 END) as with_telefone,
                COUNT(CASE WHEN (email IS NOT NULL AND email != '') 
                           AND (telefone IS NOT NULL AND telefone != '') THEN 1 END) as with_both
            FROM proponentes
        """)).fetchone()
        
        total = result[0]
        with_email = result[1]
        with_telefone = result[2]
        with_both = result[3]
        
        print(f"📊 Status da Tabela Proponentes:")
        print(f"   Total de registros: {total:,}")
        print(f"   Com email: {with_email:,} ({with_email/total*100:.1f}%)")
        print(f"   Com telefone: {with_telefone:,} ({with_telefone/total*100:.1f}%)")
        print(f"   Com ambos: {with_both:,} ({with_both/total*100:.1f}%)")
        print("")
        
        missing = total - with_both
        print(f"🎯 Registros que precisam de enriquecimento: {missing:,}")
        print("")
        
        if missing > 0:
            sys.exit(1)  # Signal that enrichment is needed
        else:
            sys.exit(0)  # All good
            
except Exception as e:
    print(f"❌ Erro ao verificar tabela: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(2)
PYEOF

VERIFY_EXIT_CODE=$?

if [ $VERIFY_EXIT_CODE -eq 0 ]; then
    echo "✅ Todos os proponentes já têm contatos completos!"
    echo "🚀 Você já pode importar a planilha!"
    exit 0
elif [ $VERIFY_EXIT_CODE -eq 2 ]; then
    echo "❌ Erro na verificação. Verifique o DATABASE_URL no .env"
    exit 1
fi

echo "🤖 Iniciando enriquecimento automático..."
echo ""
echo "⚠️  Isso vai fazer chamadas à Brasil API (Receita Federal)"
echo "⏱️  Pode demorar alguns minutos dependendo da quantidade de registros"
echo ""

# Rodar enrichment
python3 -c "
import sys
from src.enrichment.enrichment_runner import enrich_missing_contacts

# Rodar com limite de 100 para teste (remova o limit para processar todos)
stats = enrich_missing_contacts(limit=100, batch_size=10, delay_between_batches=0.5)

print(f'\n📈 Estatísticas do Enriquecimento:')
print(f'   Total verificados: {stats[\"total_checked\"]:,}')
print(f'   Enriquecidos: {stats[\"enriched\"]:,}')
print(f'   Emails adicionados: {stats[\"email_added\"]:,}')
print(f'   Telefones adicionados: {stats[\"telefone_added\"]:,}')
print(f'   Chamadas API: {stats[\"api_calls\"]:,}')
print(f'   Erros: {stats[\"api_errors\"]:,}')
"

echo ""
echo "✅ Enriquecimento concluído!"
echo ""
echo "🔄 Verificando resultado final..."

python3 << 'PYEOF'
from sqlalchemy import text
from src.loader.database import get_engine

engine = get_engine()
with engine.connect() as conn:
    result = conn.execute(text("""
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN (email IS NOT NULL AND email != '') 
                       AND (telefone IS NOT NULL AND telefone != '') THEN 1 END) as with_both
        FROM proponentes
    """)).fetchone()
    
    total = result[0]
    with_both = result[1]
    coverage = with_both/total*100 if total > 0 else 0
    
    print(f"📈 Cobertura final: {with_both:,}/{total:,} ({coverage:.1f}%)")
    print("")
    print("🚀 Pronto para importar a planilha!")
PYEOF

