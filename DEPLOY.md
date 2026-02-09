# 🚀 Deploy no Streamlit Cloud

## Pré-requisitos

- ✅ Conta Streamlit Cloud (você já tem)
- ✅ Repositório GitHub com o código
- ✅ Database Railway configurado

## Passo a Passo

### 1️⃣ **Push para GitHub**

```bash
# Commit final
git add -A
git commit -m "feat: dashboard completo com qualificação de leads"

# Push para o repositório
git push origin master
```

### 2️⃣ **Criar/Atualizar App no Streamlit Cloud**

1. Acesse https://share.streamlit.io/
2. Clique em **"New app"** (ou selecione app existente)
3. Configure:
   - **Repository:** seu-usuario/Projetus
   - **Branch:** master
   - **Main file path:** `src/dashboard/streamlit_app.py`

### 3️⃣ **Configurar Secrets (IMPORTANTE!)**

No Streamlit Cloud:
1. Vá em **App Settings** (ícone de engrenagem)
2. Clique em **Secrets**
3. Cole o conteúdo abaixo (substitua com suas credenciais Railway):

```toml
# Database Connection
[database]
DATABASE_URL = "postgresql://postgres:SUA_SENHA@containers-us-west-XXX.railway.app:5432/railway"
```

**Para pegar a URL do Railway:**
```bash
# Na sua máquina:
echo $DATABASE_URL
```

Ou no Railway:
- Dashboard → PostgreSQL → Connect → Connection URL

### 4️⃣ **Atualizar Código de Conexão (se necessário)**

O código já está preparado para ler do Streamlit Secrets. Verifique em `src/loader/database.py`:

```python
import streamlit as st

def get_database_url():
    # Tenta ler do Streamlit secrets primeiro
    if hasattr(st, 'secrets') and 'database' in st.secrets:
        return st.secrets['database']['DATABASE_URL']
    # Senão, usa variável de ambiente
    return os.getenv('DATABASE_URL')
```

### 5️⃣ **Deploy!**

1. Clique em **"Deploy"**
2. Aguarde o build (~2-3 minutos)
3. 🎉 Dashboard online!

## 📋 Checklist de Verificação

Antes de fazer deploy, confirme:

- [ ] `requirements.txt` tem todas as dependências
- [ ] `.streamlit/config.toml` configurado
- [ ] Código commitado e pushed
- [ ] DATABASE_URL do Railway copiado
- [ ] Secrets configurados no Streamlit Cloud

## 🔒 Segurança

**NUNCA commite:**
- ❌ `.env` com credenciais
- ❌ `.streamlit/secrets.toml` (use .example)
- ❌ DATABASE_URL no código

**Use apenas:**
- ✅ Streamlit Secrets (online)
- ✅ Environment variables (local)

## 🐛 Troubleshooting

### Erro: "ModuleNotFoundError"
→ Falta dependência no `requirements.txt`

### Erro: "Connection refused" (database)
→ Verifique DATABASE_URL nos Secrets

### Erro: "File not found: streamlit_app.py"
→ Verifique o caminho: `src/dashboard/streamlit_app.py`

### Dashboard carrega mas sem dados
→ Database vazio. Execute `load_qualified_leads.py` primeiro

## 📊 Dados no Railway

**IMPORTANTE:** Os dados devem estar carregados no Railway ANTES do deploy.

Para carregar/atualizar dados:

```bash
# Na sua máquina, com Railway DATABASE_URL configurado:
python load_qualified_leads.py
```

## 🔄 Atualizações Futuras

Após modificar o código:

```bash
git add -A
git commit -m "descrição da mudança"
git push origin master
```

O Streamlit Cloud detecta automaticamente e faz redeploy!

## 📞 Suporte

- Streamlit Docs: https://docs.streamlit.io/deploy
- Railway Docs: https://docs.railway.app/
