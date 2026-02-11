# Data Enrichment - PROJETUS

## 📊 Situação Atual

### Dados de Contato no Transfer Gov

O arquivo `siconv_proponentes.csv` do Transfer Gov **já contém** dados de contato:
- ✅ **99.6%** dos registros têm email (66,452 de 66,686)
- ✅ **94.3%** dos registros têm telefone (62,896 de 66,686)

### Problema Identificado

Os dados de contato **não estavam sendo carregados no banco** porque o arquivo `sample_proponentes_detalhado.csv` não estava sendo processado corretamente pelo pipeline.

## 🔌 Solução Implementada: BrasilAPI

Criamos um módulo de enriquecimento que usa a **BrasilAPI** (gratuita) para buscar dados de contato via CNPJ.

### Estrutura Criada

```
src/enrichment/
├── __init__.py              # Módulo de enriquecimento
├── __main__.py              # Permite rodar como: python -m src.enrichment
├── brasil_api.py            # Client da BrasilAPI
├── enrichment_runner.py     # Lógica de enriquecimento em batch
└── cli.py                   # Comandos CLI
```

## 🚀 Como Usar

### 1. Enriquecer todos os proponentes sem contato

```bash
python -m src.enrichment contacts --limit 100
```

### 2. Enriquecer com batches menores (rate limiting)

```bash
python -m src.enrichment contacts --batch-size 25 --delay 2.0
```

### 3. Enriquecer um CNPJ específico

```bash
python -m src.enrichment cnpj 00000000000191
```

### 4. Forçar re-enriquecimento

```bash
python -m src.enrichment cnpj 00000000000191 --force
```

### 5. Modo verbose

```bash
python -m src.enrichment contacts -v --limit 10
```

## 📝 Parâmetros

### Comando `contacts`

- `--limit, -l`: Máximo de registros a enriquecer (default: todos)
- `--batch-size, -b`: Tamanho do batch (default: 50)
- `--delay, -d`: Delay entre batches em segundos (default: 1.0)
- `--verbose, -v`: Habilita logs detalhados

### Comando `cnpj`

- `CNPJ`: CNPJ a enriquecer (obrigatório)
- `--force, -f`: Força re-enriquecimento mesmo se já tiver dados
- `--verbose, -v`: Habilita logs detalhados

## 🔍 BrasilAPI

A **BrasilAPI** é uma API gratuita que agrega dados da Receita Federal.

**Endpoints usados:**
- `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`

**Dados retornados:**
- Razão social
- Nome fantasia
- Endereço completo
- **Telefones** (ddd_telefone_1, ddd_telefone_2)
- **Email** (quando disponível)

**Limitações:**
- ✅ **Telefones**: Alta cobertura (~95%)
- ⚠️ **Emails**: Baixa cobertura (~5-10%)
  - A maioria dos emails vem melhor do Transfer Gov
  - BrasilAPI útil principalmente para telefones

**Rate Limits:**
- Nenhum rate limit agressivo
- Recomendado usar batches com delay para ser respeitoso

## 🎯 Resultados de Teste

Teste com 5 registros:
```
Total checked:     5
Enriched:          5
Emails added:      0
Telefones added:   5
API calls:         5
API errors:        0
```

## 🔧 Próximos Passos

### 1. Corrigir Pipeline Principal

O pipeline precisa processar o arquivo `sample_proponentes_detalhado.csv` corretamente para popular os dados do Transfer Gov no banco.

### 2. Integrar Enriquecimento no Pipeline

Adicionar step de enriquecimento automático após o load:

```python
# Em src/orchestrator/pipeline.py, após load_extraction_data()

# Enrich missing contacts
from src.enrichment.enrichment_runner import enrich_missing_contacts
stats = enrich_missing_contacts(limit=1000, batch_size=50)
logger.info(f"Enriched {stats['enriched']} proponentes")
```

### 3. Task Agendada

Criar cron job para enriquecimento periódico:

```yaml
# config.yaml
enrichment:
  enabled: true
  schedule: "0 10 * * *"  # Daily at 10am
  batch_size: 50
  max_per_run: 1000
```

### 4. Cache de Resultados

Criar cache para evitar consultas duplicadas:

```python
# Futura implementação
- Tabela enrichment_cache (cnpj, email, telefone, fetched_at)
- TTL de 30 dias
```

## 📊 Métricas

Para acompanhar a cobertura de dados:

```sql
-- Coverage de contatos
SELECT
    COUNT(*) as total,
    COUNT(email) as com_email,
    COUNT(telefone) as com_telefone,
    ROUND(COUNT(email)::float / COUNT(*) * 100, 2) as email_coverage,
    ROUND(COUNT(telefone)::float / COUNT(*) * 100, 2) as telefone_coverage
FROM proponentes;
```

## 🔗 Referências

- **BrasilAPI**: https://brasilapi.com.br/docs#tag/CNPJ
- **ReceitaWS** (alternativa): https://receitaws.com.br/api
- **Transfer Gov**: Portal de dados governamentais
