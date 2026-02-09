# Otimizações de Performance para Railway Database

## Problema Identificado

O dashboard estava lento devido a:
1. **Query complexa** com múltiplos JOINs e STRING_AGG em `get_qualified_leads()`
2. **Falta de índices** em colunas críticas
3. **Cache curto** (10 minutos) no Streamlit
4. **Connection pool** não otimizado para Railway

## Otimizações Aplicadas

### 1. **Índices de Performance** (`add_performance_indexes.sql`)

Índices adicionados:
- **Junction tables**: `proposta_apoiadores`, `proposta_emendas`
- **Composite index**: `ix_proponentes_qualification` (otimiza filtros do dashboard)
- **Full-text search**: `pg_trgm` para busca por nome
- **Foreign keys**: índices em todas as relações (convenios, desembolsos, etc)

### 2. **Query Otimizada** (`qualificacao.py`)

**Antes**: JOIN de 4 tabelas + STRING_AGG + GROUP BY
```sql
SELECT ... STRING_AGG(DISTINCT a.orgao, ', ')
FROM proponentes p
LEFT JOIN propostas prop ON ...
LEFT JOIN proposta_apoiadores pa ON ...
LEFT JOIN apoiadores a ON ...
GROUP BY ... (18 colunas!)
```

**Depois**: Query simples + fetch separado de ministérios
```sql
SELECT ... FROM proponentes p WHERE ...
-- Ministérios buscados separadamente apenas para leads exibidos
```

**Resultado esperado**: 5-10x mais rápido 🚀

### 3. **Cache Aumentado**

- Cache do Streamlit: 10m → **30m**
- Menos queries para Railway
- Dados ainda frescos o suficiente

### 4. **Connection Pool Otimizado**

```python
# Antes
pool_size=5, max_overflow=10  # Total: 15 connections

# Depois
pool_size=2, max_overflow=3   # Total: 5 connections
pool_recycle=300              # Recicla a cada 5min
statement_timeout=30000       # Timeout de 30s
```

**Por quê?**
- Railway tem limites de conexões
- Latência de rede exige timeouts
- Menos conexões = mais estável

## Como Aplicar

### Opção 1: Script Python (Recomendado)

```bash
# Aplicar todos os índices automaticamente
python migrations/apply_indexes.py
```

### Opção 2: SQL Direto no Railway

1. Acesse o Railway Dashboard
2. Abra o PostgreSQL console
3. Copie e cole o conteúdo de `add_performance_indexes.sql`
4. Execute

### Opção 3: Via psql

```bash
# Conectar ao Railway
psql postgresql://postgres:FCIKWxLaKmAdKYkWjGKsLZCuYBlzYtQl@shortline.proxy.rlwy.net:30852/railway

# Executar o script
\i migrations/add_performance_indexes.sql
```

## Verificar Índices Aplicados

```sql
-- Ver todos os índices criados
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'ix_%'
ORDER BY tablename, indexname;

-- Verificar tamanho dos índices
SELECT
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as index_size
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;
```

## Performance Esperada

### Antes
- Query principal: **3-5 segundos**
- Load do dashboard: **5-8 segundos**
- STRING_AGG scan: 4 tabelas

### Depois
- Query principal: **0.3-0.5 segundos** (10x mais rápido!)
- Load do dashboard: **0.5-1 segundo**
- Index scan direto

## Monitoramento

### Ver queries lentas no PostgreSQL

```sql
-- Queries mais lentas
SELECT
    query,
    calls,
    total_time,
    mean_time,
    min_time,
    max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### Verificar uso de índices

```sql
-- Índices mais usados
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

## Rollback (se necessário)

```sql
-- Remover todos os índices de performance
DROP INDEX IF EXISTS ix_proposta_apoiadores_proposta_id;
DROP INDEX IF EXISTS ix_proposta_apoiadores_apoiador_id;
DROP INDEX IF EXISTS ix_proposta_emendas_proposta_id;
DROP INDEX IF EXISTS ix_proposta_emendas_emenda_id;
DROP INDEX IF EXISTS ix_proponentes_qualification;
DROP INDEX IF EXISTS ix_proponentes_nome_trgm;
DROP INDEX IF EXISTS ix_apoiadores_orgao;
DROP INDEX IF EXISTS ix_propostas_proponente_cnpj;
DROP INDEX IF EXISTS ix_convenios_proposta_id;
DROP INDEX IF EXISTS ix_desembolsos_convenio_id;
DROP INDEX IF EXISTS ix_historico_situacao_proposta_id;

-- Remover extensão (se não usada por outros)
DROP EXTENSION IF EXISTS pg_trgm;
```

## Próximos Passos (Opcional)

Se ainda estiver lento após essas otimizações:

1. **Materialized View** para leads qualificados
2. **Connection pooling externo** (PgBouncer)
3. **Read replica** no Railway
4. **Migrar para PostgreSQL local** (desenvolvimento)
5. **Upgrade do plano Railway** (mais recursos)

## Suporte

Se tiver problemas:
1. Verifique os logs: `python migrations/apply_indexes.py`
2. Confira se os índices foram criados: query acima
3. Reinicie o Streamlit para limpar o cache
