# Validação de despesas — 12/11/2026

Implementação em `/despesas`, APIs privadas `/api/despesas`, política versionada, migração aditiva e integração com fila dedicada ao Conta Azul.

## Evidência automatizada

- 22 testes de domínio/store/integração: passaram em PostgreSQL local isolado `projete_expenses_test_20261112`, com API do Conta Azul simulada. Migração reaplicada; cadeia de autorização; dispensa; compra; ajustes; autorização por período; autoaprovação; usuários inativos; revisão concorrente; saldo parcial; comprovante duplicado; evidência histórica; D+2; flags; exportação única; resultado incerto; conciliação e baixa.
- 4 testes HTTP: passaram com login real por credenciais fictícias, Next local e a mesma base isolada. Sessão ativa, acesso compartilhado entre áreas, origem obrigatória, drafts privados, upload/download autenticado, headers de segurança, Head → Financeiro → lançamento local, bloqueios de alçada e política.
- 59 testes de regressão: passaram, sem skips, com PostgreSQL isolado `projete_finance_expenses_test_20261112`. Financeiro existente (domain, engine, providers, store, access) e navegação por áreas. Rodados sequencialmente após um timeout inicial no teste preexistente com limite de conexão de 150 ms durante compilação simultânea do Next.
- TypeScript sem erros; lint direcionado sem avisos; build otimizado Next concluído com as rotas de despesas; diff sem erros de whitespace.

## Limites da validação

- Validação visual não realizada: host do navegador indisponível; tentativa de acesso nativo ao Chrome também expirou. HTML autenticado e APIs foram exercitados por HTTP; isso não substitui aceitação visual desktop/mobile.
- Nenhuma despesa, fornecedor, aprovação ou lançamento real foi criado. Nenhum e-mail enviado. Conta Azul real não foi exercitado nesta validação.
- Política real, documentos exigidos, alçadas, substitutos, categorias e calendário corporativo ainda dependem de cadastro e conferência pela empresa.
- Não aplicada migração em produção, não instalado o timer dedicado nem habilitada integração. Hotmart, emissão fiscal e envios/relatórios existentes não foram ativados ou reconfigurados.

## Reprodução

No diretório `web`, usar somente bancos locais descartáveis:

```sh
EXPENSE_TEST_DATABASE_URL=postgresql://localhost/projete_expenses_test_20261112 npx tsx --test tests/expenses.test.mjs
EXPENSE_TEST_DATABASE_URL=postgresql://localhost/projete_expenses_test_20261112 EXPENSE_TEST_BASE_URL=http://localhost:3204 npx tsx --test tests/expenses-http.test.mjs
FINANCE_TEST_DATABASE_URL=postgresql://localhost/projete_finance_expenses_test_20261112 npx tsx --test --test-concurrency=1 tests/finance-domain.test.mjs tests/finance-engine.test.mjs tests/finance-providers.test.mjs tests/finance-store.test.mjs tests/finance-access.test.mjs src/lib/areas.test.ts
```

Não rodar os dois arquivos de despesas ao mesmo tempo na mesma base; o fixture HTTP reinicializa os dados do tenant fictício. O servidor HTTP precisa usar essa mesma base, `DATABASE_SSL=disable`, tenant `test-expenses` e URL local compatível com as verificações de origem. Para testes de produção do build, usar `npm run build` com conexão apontando para a base local, preservando os arquivos privados de ambiente.
