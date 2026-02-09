from src.loader.database import get_engine
from sqlalchemy import text

engine = get_engine()
with engine.connect() as conn:
    # Check if tables have data
    result = conn.execute(text('SELECT COUNT(*) FROM propostas'))
    print(f'Total propostas: {result.scalar():,}')

    # Check years
    result = conn.execute(text('SELECT EXTRACT(YEAR FROM data_publicacao) as year, COUNT(*) FROM propostas WHERE data_publicacao IS NOT NULL GROUP BY year ORDER BY year DESC LIMIT 10'))
    print('\nBy year:')
    for row in result:
        print(f'  {int(row[0])}: {row[1]:,}')

    # Check proponentes
    result = conn.execute(text('SELECT COUNT(*) FROM proponentes'))
    print(f'\nTotal proponentes: {result.scalar():,}')

    result = conn.execute(text('SELECT COUNT(*) FROM proponentes WHERE is_osc = true'))
    print(f'OSC proponentes: {result.scalar():,}')

    # Check for 2026 OSCs specifically
    result = conn.execute(text('''
        SELECT COUNT(DISTINCT p.id)
        FROM proponentes p
        JOIN propostas pr ON p.cnpj = pr.proponente_cnpj
        WHERE EXTRACT(YEAR FROM pr.data_publicacao) = 2026
        AND p.is_osc = true
    '''))
    print(f'\n2026 OSC proponentes: {result.scalar():,}')
