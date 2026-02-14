# Scripts do CRM PROJETUS

## 📋 Índice

- [distribute-leads.js](#distribute-leadsjs) - Distribuição automática de leads
- [update-users.js](#update-usersjs) - Atualização de usuários

---

## distribute-leads.js

### 🎯 Propósito

Script para distribuição automática e equilibrada de leads não atribuídos entre vendedores ativos usando algoritmo round-robin.

### 🚀 Como Usar

```bash
cd web
node scripts/distribute-leads.js
```

### 📊 O Que o Script Faz

1. **Busca vendedores ativos**
   - Filtra usuários com `role = 'vendedor'`
   - Filtra apenas usuários com `active = true`
   - Mostra contagem atual de leads por vendedor

2. **Busca leads não atribuídos**
   - Agrupa por CNPJ (cada CNPJ pode ter múltiplas emendas)
   - Filtra apenas leads onde `vendedor_id IS NULL`
   - Calcula total de emendas a serem distribuídas

3. **Distribui usando round-robin**
   - Itera sobre cada CNPJ não atribuído
   - Atribui todas as emendas do CNPJ ao vendedor atual
   - Move para o próximo vendedor (índice circular)
   - Garante distribuição equilibrada

4. **Mostra relatório final**
   - Total de CNPJs atribuídos
   - Total de leads (emendas) atribuídos
   - Distribuição final por vendedor

### 📈 Exemplo de Saída

```
🔍 Fetching active vendedores...

✅ Found 4 active vendedores:
   - Elisson (elisson@projetus.org): 22 leads
   - Gabriel (gabriel@projetus.org): 15 leads
   - Vitoria (vitoria@projetus.org): 0 leads
   - Wellington (wellington@projetus.org): 27 leads

🔍 Fetching unassigned leads...

✅ Found 3188 unassigned CNPJs
   Total leads (including emendas): 3188

🎲 Distributing leads using round-robin...

   ✓ CINE-CLUBE BUZIOS (00067617000124) → Elisson (1 leads)
   ✓ ASSOCIACAO NACIONAL DE FORTALECIMENTO... → Gabriel (1 leads)
   ...

✅ Distribution complete!
   Total CNPJs assigned: 3188
   Total leads assigned: 3188

📊 Final distribution:
   - Elisson: 819 leads
   - Gabriel: 812 leads
   - Vitoria: 797 leads
   - Wellington: 824 leads
```

### ⚙️ Configuração

O script usa as seguintes variáveis de ambiente do arquivo `.env.local`:

- `DATABASE_URL` ou `POSTGRES_URL` - String de conexão PostgreSQL

### 🔒 Regras de Negócio

1. **Agrupamento por CNPJ**
   - Todas as emendas de um mesmo CNPJ vão para o mesmo vendedor
   - Evita conflitos de vendedores contactando a mesma organização

2. **Round-robin**
   - Distribuição circular entre vendedores
   - Garante equilíbrio na carga de trabalho
   - Diferença máxima de ~27 leads entre vendedores

3. **Apenas leads não atribuídos**
   - Não reatribui leads que já têm vendedor
   - Filtra apenas `vendedor_id IS NULL`

4. **Apenas vendedores ativos**
   - Considera apenas `role = 'vendedor'`
   - Considera apenas `active = true`

### 🛠️ Troubleshooting

**Erro: "No active vendedores found!"**
- Verifique se existem usuários com `role = 'vendedor'` e `active = true`
- Execute: `SELECT * FROM users WHERE role = 'vendedor' AND active = true;`

**Erro: "Database connection error"**
- Verifique se `.env.local` existe e contém `DATABASE_URL`
- Teste a conexão: `psql $DATABASE_URL`

**Nenhum lead para distribuir**
- Todos os leads já foram atribuídos
- Mensagem: "No unassigned leads found! All leads are already assigned."

### 📝 Histórico de Execuções

| Data | CNPJs | Total Leads | Vendedores |
|------|-------|-------------|------------|
| 2026-02-13 | 3,188 | 3,188 | 4 (Elisson, Gabriel, Vitoria, Wellington) |

---

## update-users.js

### 🎯 Propósito

Script para criar/atualizar usuários do sistema com credenciais pré-definidas.

### 🚀 Como Usar

```bash
cd web
node scripts/update-users.js
```

### ⚙️ Funcionalidade

- Cria ou atualiza usuários na tabela `users`
- Hash de senhas usando bcrypt (10 rounds)
- Suporta roles: `gestor`, `vendedor`, `visualizador`
- Exibe tabela formatada dos usuários após atualização

### 🔒 Segurança

- ⚠️ Script contém credenciais hardcoded
- ⚠️ Não commitar este arquivo com senhas reais
- ✅ Senhas são hasheadas com bcrypt antes de salvar
- ✅ Usa `ON CONFLICT` para upsert seguro

---

## 💡 Dicas

### Executar Scripts Periodicamente

Para distribuir leads automaticamente todas as manhãs, adicione ao cron:

```bash
0 9 * * * cd /path/to/projetus/web && node scripts/distribute-leads.js >> /var/log/distribute-leads.log 2>&1
```

### Verificar Resultados

Após executar distribuição, verifique no banco:

```sql
SELECT u.nome, COUNT(vp.id) as total_leads
FROM users u
LEFT JOIN vendedor_projetos vp ON u.id = vp.vendedor_id
WHERE u.role = 'vendedor'
GROUP BY u.id, u.nome
ORDER BY u.nome;
```

### Reverter Distribuição (se necessário)

Para resetar atribuições:

```sql
-- ⚠️ CUIDADO: Remove TODAS as atribuições de vendedores
UPDATE vendedor_projetos SET vendedor_id = NULL;
```

---

**Última atualização:** 2026-02-13
