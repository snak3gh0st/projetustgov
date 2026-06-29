# Produtos Digitais: MOSC ETL

## Fonte analisada

- GitHub: https://github.com/Plataformas-Cidadania/mapa-osc-data-import
- Dataset Base dos Dados: https://basedosdados.org/dataset/2d7fac01-023b-4747-96a7-78c1aabf5c17?raw_data_source=b8795a22-4110-4335-bed8-72322775f3fa
- Download oficial mensal: https://mapaosc.ipea.gov.br/base-dados

O repositório externo é uma rotina R de atualização do Mapa das OSC, não um loader simples para o nosso app. Ele busca dados da Receita Federal, RAIS e TransfereGOV, classifica OSCs, gera tabelas MOSC e atualiza PostgreSQL com controle de execução.

A melhor entrada para o Projetus é o download oficial mensal do Mapa das OSC: a página informa coleta maio/2026, base principal CSV de 334024.31 KB e arquivo de áreas/subáreas XLSX de 82 MB. Isso evita portar a rotina R e evita depender de uma tabela estruturada da Base dos Dados que não aparece publicada na página do dataset.

## Carga aplicada em 2026-06-29

- Banco: `sigma-db/projetus_hub`.
- Snapshot: `20260522_MOSC_baseDivulgacao.csv`.
- Organizações carregadas em staging: 1.108.111.
- Organizações com latitude/longitude: 1.107.929.
- Classificações de área/subárea carregadas: 2.202.449.
- CNPJs MOSC já em `proponentes`: 16.266.
- CNPJs MOSC já em `vendedor_projetos`: 5.743.
- CNPJs MOSC fora de `proponentes`: 1.091.845.

## O que já temos no Projetus

- `proponentes.cnpj` é a chave natural para cruzamento.
- `proponentes.is_osc`, `natureza_juridica`, `estado`, `municipio`, `email` e `telefone` já são campos úteis para enriquecimento.
- `extraction_logs` e `data_lineage` já indicam o padrão local de rastreabilidade.
- `vendedor_projetos` guarda dados comerciais e não deve ser sobrescrito por carga pública.
- Em `sigma-db/projetus_hub`, `proponentes` já está completo para email, telefone, natureza, UF e município; o ganho da MOSC é classificação, área/subárea e descoberta de CNPJs fora do funil.

## Padrão de atualização observado

- A rotina MOSC exige mudança manual de `definicoes$schema_receita`.
- A própria rotina manda verificar disponibilidade de RFB/RAIS antes de atualizar.
- O script atual traz comentário de atualização com dados de abril/2026.
- O controle MOSC registra execução, processos e arquivos de backup.

## Recomendação

1. Usar o download oficial mensal do Mapa das OSC como snapshot de entrada.
2. Carregar tudo primeiro em `digital_products_mosc_orgs`.
3. Carregar áreas/subáreas em `digital_products_mosc_areas`.
4. Comparar por CNPJ contra `proponentes` e `vendedor_projetos`.
5. Atualizar automaticamente apenas campos faltantes ou flags públicas:
   - `proponentes.is_osc`
   - natureza jurídica
   - UF/município/endereço/CEP quando vazio
   - email/telefone quando vazio
6. Registrar cada carga em `digital_products_etl_runs`.

## O que evitar agora

- Não portar a rotina R inteira para dentro do Next.js.
- Não sobrescrever contatos ou status comerciais já editados pelo time.
- Não agendar cron antes de validar dois snapshots consecutivos.

## Próximo passo técnico

Aplicar `migrations/create_digital_products_mosc_staging.sql`, escolher o snapshot de entrada, e criar um loader idempotente com `ON CONFLICT (cnpj) DO UPDATE` somente no staging.
