# Sistema de Contatos - PROJETUS CRM

## 📋 Visão Geral

O PROJETUS CRM possui um sistema automatizado de enriquecimento de contatos que integra dados do TransferênciaGov com informações da Receita Federal via Brasil API.

## 🔄 Fluxo Completo de Dados

```
┌─────────────────┐
│  TransferGov    │ (Portal do Governo Federal)
│   (Web Scraping)│
└────────┬────────┘
         │ ETL Pipeline (Python)
         ↓
┌─────────────────┐
│   Proponentes   │ (Tabela PostgreSQL)
│   - CNPJ        │
│   - Nome        │
│   - Email       │ ← inicialmente vazio
│   - Telefone    │ ← inicialmente vazio
└────────┬────────┘
         │
         │ Enrichment Runner
         ↓
┌─────────────────┐
│   Brasil API    │ (https://brasilapi.com.br)
│ (Receita Federal)│
│   - Email       │
│   - Telefone    │
└────────┬────────┘
         │
         ↓ Atualização automática
┌─────────────────┐
│   Proponentes   │ (Tabela atualizada)
│   - CNPJ        │
│   - Nome        │
│   - Email       │ ✅ preenchido
│   - Telefone    │ ✅ preenchido
└────────┬────────┘
         │
         │ Import Spreadsheet
         ↓
┌─────────────────┐
│ Vendedor_Projetos│ (Leads CRM)
│   - CNPJ        │
│   - Email       │ ✅ copiado de proponentes
│   - Telefone    │ ✅ copiado de proponentes
└─────────────────┘
```

## 🛠️ Componentes Técnicos

### 1. ETL Pipeline (Python)
**Localização:** `src/`

- Extrai dados de propostas do TransferGov
- Armazena CNPJs na tabela `proponentes`
- Email e telefone ficam vazios inicialmente

### 2. Enrichment Runner (Python)
**Localização:** `src/enrichment/`

**Arquivo principal:** `src/enrichment/enrichment_runner.py`

```python
def enrich_missing_contacts(limit=None, batch_size=50):
    """
    Encontra proponentes sem email/telefone e enriquece via BrasilAPI

    - Busca proponentes com campos vazios
    - Consulta BrasilAPI por CNPJ
    - Atualiza email e telefone
    - Rate limiting: 50 registros/batch com delay
    """
```

### 3. Brasil API Client (Python)
**Localização:** `src/enrichment/brasil_api.py`

**Endpoint:** `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`

**Dados extraídos:**
- `email`: Email cadastrado na Receita Federal
- `ddd_telefone_1`: Telefone principal
- `ddd_telefone_2`: Telefone secundário (fallback)

```python
class BrasilAPIClient:
    def enrich_proponente(self, cnpj: str) -> dict:
        """
        Retorna: {"email": "...", "telefone": "..."}
        """
        cnpj_data = self.get_cnpj_data(cnpj)
        return self.extract_contact_info(cnpj_data)
```

### 4. Import Spreadsheet API (Next.js)
**Localização:** `web/src/app/api/import-spreadsheet/route.ts`

**Fluxo:**
1. Carrega mapa de contatos da tabela `proponentes`:
```typescript
const proponentesRes = await pool.query(
  `SELECT cnpj, nome, email, telefone
   FROM proponentes
   WHERE email IS NOT NULL OR telefone IS NOT NULL`
)
const contactByCnpj = new Map()
```

2. Durante inserção de leads, enriquece automaticamente:
```typescript
const contact = contactByCnpj.get(cnpj)
const enrichedTelefone = contact?.telefone || null
const enrichedEmail = contact?.email || null
```

3. Leads recebem contatos automaticamente baseado no CNPJ

## 📊 Schema do Banco de Dados

### Tabela: `proponentes`
```sql
CREATE TABLE proponentes (
  id SERIAL PRIMARY KEY,
  cnpj VARCHAR(14) NOT NULL UNIQUE,
  nome VARCHAR,
  natureza_juridica VARCHAR(100),
  email VARCHAR,           -- Enriquecido via Brasil API
  telefone VARCHAR,        -- Enriquecido via Brasil API
  is_existing_client BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabela: `vendedor_projetos`
```sql
CREATE TABLE vendedor_projetos (
  id SERIAL PRIMARY KEY,
  vendedor_id UUID REFERENCES users(id),
  cnpj VARCHAR(14),
  nome VARCHAR,
  email VARCHAR,           -- Copiado de proponentes durante import
  telefone VARCHAR,        -- Copiado de proponentes durante import
  status_contato VARCHAR DEFAULT 'Não Contatado',
  -- ... outros campos
);
```

## 🚀 Como Executar Enriquecimento

### Opção 1: Via CLI (Python)
```bash
cd src/enrichment
python enrichment_runner.py
```

### Opção 2: Programaticamente
```python
from src.enrichment.enrichment_runner import enrich_missing_contacts

# Enriquecer até 100 proponentes
stats = enrich_missing_contacts(limit=100, batch_size=10)

print(f"Enriched: {stats['enriched']}")
print(f"Emails added: {stats['email_added']}")
print(f"Telefones added: {stats['telefone_added']}")
```

### Opção 3: Enriquecer CNPJ específico
```python
from src.enrichment.enrichment_runner import enrich_specific_cnpj

success = enrich_specific_cnpj("00000000000191", force=True)
```

## 📈 Estatísticas de Enriquecimento

O enrichment runner retorna:
```python
{
    "total_checked": 100,      # Total de registros verificados
    "enriched": 45,            # Registros que receberam dados
    "email_added": 38,         # Emails adicionados
    "telefone_added": 42,      # Telefones adicionados
    "api_calls": 100,          # Chamadas à Brasil API
    "api_errors": 3,           # Erros de API
    "already_complete": 55     # Já tinham contatos completos
}
```

## ⚙️ Configurações e Rate Limiting

### Brasil API Client
- **Timeout:** 30 segundos por requisição
- **Batch size:** 50 registros
- **Delay entre batches:** 1.0 segundo
- **Rate limit handling:** Status 429 tratado gracefully

### Import Spreadsheet
- **Limite de proponentes:** 100.000 registros carregados em memória
- **Enriquecimento automático:** Sim, durante import
- **Fallback:** Se tabela `proponentes` não existe, continua sem enriquecimento

## 🔍 Visualização no CRM

### Página de Leads (`/leads`)
- Exibe telefone e email em cada card de lead
- Botões de ação: WhatsApp e Email
- Edição inline para gestores/vendedores

### Página de Detalhes (`/lead/[cnpj]`)
- Seção de contato com telefone e email
- Links diretos: `https://wa.me/55{telefone}`
- Email: `mailto:{email}`
- Edição inline com validação

## 🎯 Benefícios do Sistema

1. ✅ **Automatizado:** Contatos são enriquecidos sem intervenção manual
2. ✅ **Fonte oficial:** Dados vêm da Receita Federal (Brasil API)
3. ✅ **Integrado:** Import de leads já traz contatos prontos
4. ✅ **Eficiente:** Rate limiting e batching para performance
5. ✅ **Resiliente:** Tratamento de erros e timeouts
6. ✅ **Gratuito:** Brasil API não cobra por requisições

## 📝 Logs e Monitoramento

### Logs do Enrichment
```python
logger.info(f"Found {len(proponentes)} proponentes needing enrichment")
logger.info(f"Added email for {proponente.nome}: {email}")
logger.info(f"Added telefone for {proponente.nome}: {telefone}")
logger.error(f"Error enriching {cnpj}: {error}")
```

### Verificar enriquecimento no banco
```sql
-- Proponentes com contatos
SELECT COUNT(*) FROM proponentes
WHERE email IS NOT NULL OR telefone IS NOT NULL;

-- Proponentes faltando enriquecimento
SELECT COUNT(*) FROM proponentes
WHERE (email IS NULL OR email = '')
  AND (telefone IS NULL OR telefone = '');
```

## 🔧 Troubleshooting

### Problema: Leads importados sem contatos
**Solução:** Executar enrichment runner antes do import
```bash
python src/enrichment/enrichment_runner.py
```

### Problema: Brasil API retorna 429 (rate limit)
**Solução:** Aumentar delay entre batches
```python
enrich_missing_contacts(batch_size=20, delay_between_batches=2.0)
```

### Problema: Timeout em requisições
**Solução:** Ajustar timeout do cliente
```python
client = BrasilAPIClient(timeout=60.0)
```

---

**Última atualização:** 2026-02-12
**Documentado por:** Claude Code
**Status:** ✅ Sistema em produção e funcionando
