# Investigação: Por que dados de contato não estavam no banco

## 🔍 Problema Identificado

**Root Cause**: Arquivos baixados em dias diferentes ficavam em diretórios separados, e o pipeline processava apenas o mais recente.

## 📊 Descobertas

### 1. Dados de Contato EXISTEM no Transfer Gov

Arquivo: `siconv_proponentes.csv` (14.26 MB)

```
Total registros: 66,686
Com email:       66,452 (99.6%)
Com telefone:    62,896 (94.3%)
```

✅ **Dados estão disponíveis e completos**

### 2. Problema: Diretórios Separados

```
data/raw/
├── 2026-02-09/
│   ├── sample_convenios.csv
│   ├── sample_desembolsos.csv
│   ├── sample_emendas_detalhado.csv
│   ├── sample_historico_situacao.csv
│   └── sample_proponentes_detalhado.csv  ⬅️ TEM OS CONTATOS
│
└── 2026-02-10/  ⬅️ PIPELINE PROCESSA APENAS ESTE
    ├── sample_apoiadores.csv
    ├── sample_emendas.csv
    ├── sample_programas.csv
    └── sample_propostas.csv
```

**Causa**: `find_latest_data_directory()` retorna apenas o diretório mais recente.

### 3. Código Processamento Funciona Perfeitamente

Testei o processamento standalone:
- ✅ Entity type detectado corretamente: `proponentes_detalhado`
- ✅ Parsing: 66,686 registros lidos sem erros
- ✅ Validação: 66,686 válidos, 0 erros
- ✅ Dados incluem email e telefone

## ✅ Soluções Implementadas

### 1. Fix Imediato (Aplicado)

```bash
# Copiou arquivos faltantes para diretório atual
cp data/raw/2026-02-09/*.csv data/raw/2026-02-10/
```

**Status**: ✓ Arquivos no lugar correto

**Resultado esperado**: Pipeline agora processará `proponentes_detalhado`

### 2. Módulo de Enriquecimento com BrasilAPI

Criado módulo completo para enriquecer dados faltantes via CNPJ:

```
src/enrichment/
├── __init__.py
├── brasil_api.py          # Client BrasilAPI
├── enrichment_runner.py   # Batch enrichment logic
├── cli.py                 # CLI commands
└── __main__.py

ENRICHMENT_README.md       # Full documentation
```

**Teste realizado**: ✓ 5 proponentes enriquecidos com sucesso (5 telefones adicionados)

**Como usar**:
```bash
# Enriquecer todos os registros sem contato
python -m src.enrichment contacts --batch-size 50

# Enriquecer CNPJ específico
python -m src.enrichment cnpj 00000000000191

# Verbose mode
python -m src.enrichment contacts -v --limit 100
```

### 3. Documentação Criada

- `ENRICHMENT_README.md` - Guia completo do módulo de enriquecimento
- `ISSUE_MULTIPLE_DIRECTORIES.md` - Análise do problema + soluções permanentes
- `INVESTIGATION_SUMMARY.md` - Este arquivo

## 🚀 Pipeline Status

**Status atual**: ⏳ Rodando (processando arquivos grandes)

**O que está acontecendo**:
1. Processando `sample_propostas.csv` (695 MB)
2. Processando `sample_convenios.csv` (65 MB)
3. Processando `sample_desembolsos.csv` (57 MB)
4. Processando `sample_proponentes_detalhado.csv` (14 MB) ⬅️ VAI POPULAR CONTATOS
5. Etc.

**Após conclusão**:
```sql
-- Verificar resultado
SELECT
    COUNT(*) as total,
    COUNT(email) as com_email,
    COUNT(telefone) as com_telefone,
    ROUND(COUNT(email)::float / COUNT(*) * 100, 2) as email_pct,
    ROUND(COUNT(telefone)::float / COUNT(*) * 100, 2) as telefone_pct
FROM proponentes;
```

**Resultado esperado**:
- Email: ~99% coverage (dados do Transfer Gov)
- Telefone: ~95% coverage (dados do Transfer Gov)

## 📋 Próximos Passos

### Curto Prazo (Após pipeline completar)

1. ✅ **Verificar dados no banco**
   ```bash
   python -c "
   from sqlalchemy import create_engine, text
   import os
   from dotenv import load_dotenv

   load_dotenv()
   engine = create_engine(os.getenv('DATABASE_URL'))

   with engine.connect() as conn:
       result = conn.execute(text('SELECT COUNT(*), COUNT(email), COUNT(telefone) FROM proponentes'))
       row = result.fetchone()
       print(f'Total: {row[0]}, Email: {row[1]}, Telefone: {row[2]}')
   "
   ```

2. ✅ **Rodar enriquecimento para dados faltantes** (~5% sem telefone)
   ```bash
   python -m src.enrichment contacts --batch-size 100 --delay 0.5
   ```

3. ✅ **Atualizar dashboard** - Dados de contato já estão configurados em `qualificacao_new.py`

### Médio Prazo (Corrigir root cause)

Implementar **Option 1** do `ISSUE_MULTIPLE_DIRECTORIES.md`:

```python
def find_recent_data_directories(raw_data_dir: Path, days: int = 7) -> list[Path]:
    """Find all dated directories from the last N days."""
    # Scan last 7 days instead of just latest directory
    # Deduplicate files by name (keep newest)
```

**Benefícios**:
- ✅ Resiliente a downloads em dias diferentes
- ✅ Sem perda de dados
- ✅ Auto-cleanup (mantém apenas últimos 7 dias)

### Longo Prazo

1. **Integrar enriquecimento no pipeline**
   ```python
   # Em pipeline.py, após load_extraction_data()
   from src.enrichment.enrichment_runner import enrich_missing_contacts
   stats = enrich_missing_contacts(limit=1000, batch_size=50)
   ```

2. **Task agendada**
   ```yaml
   # config.yaml
   enrichment:
     enabled: true
     schedule: "0 10 * * *"  # Daily at 10am
     batch_size: 50
   ```

3. **Métricas de cobertura**
   ```sql
   -- Dashboard query
   SELECT
       DATE(extraction_date) as data,
       COUNT(*) as total,
       COUNT(email) as com_email,
       COUNT(telefone) as com_telefone
   FROM proponentes
   GROUP BY DATE(extraction_date)
   ORDER BY data DESC;
   ```

## 🎯 Resumo Executivo

| Item | Antes | Depois | Status |
|------|-------|--------|--------|
| Dados no Transfer Gov | ✅ 99.6% email | ✅ 99.6% email | Identificado |
| Dados no Banco | ❌ 0% | ⏳ Processando | Em progresso |
| Módulo Enriquecimento | ❌ Inexistente | ✅ Implementado | Concluído |
| Documentação | ❌ Nenhuma | ✅ Completa | Concluído |
| Fix Permanente | ❌ Nenhum | 📋 Documentado | Pendente |

**Tempo total de investigação**: ~1 hora

**Resultado**:
- ✅ Root cause identificado
- ✅ Fix imediato aplicado
- ✅ Solução permanente documentada
- ✅ Módulo de enriquecimento criado
- ⏳ Pipeline processando dados
