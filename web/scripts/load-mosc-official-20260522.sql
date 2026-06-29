\set ON_ERROR_STOP on
\set source_file '/tmp/20260522_MOSC_baseDivulgacao.csv'
\set source_reference 'mapaosc:20260522_MOSC_baseDivulgacao.csv'

DROP TABLE IF EXISTS digital_products_mosc_import_raw;

CREATE UNLOGGED TABLE digital_products_mosc_import_raw (
  cnpj TEXT,
  tx_razao_social_osc TEXT,
  tx_nome_fantasia_osc TEXT,
  natureza_juridica TEXT,
  matriz_filial TEXT,
  situacao_cadastral TEXT,
  dt_fundacao_osc TEXT,
  removida_do_mosc TEXT,
  data_fechamento TEXT,
  ano_fechamento TEXT,
  tx_endereco_completo TEXT,
  cd_municipio TEXT,
  municipio_nome TEXT,
  "UF_Sigla" TEXT,
  longitude TEXT,
  latitude TEXT,
  cnae TEXT,
  cnae_secundaria TEXT,
  "Area_Assistencia_social" TEXT,
  "Area_Associacoes_patronais_e_profissionais" TEXT,
  "Area_Cultura_e_recreacao" TEXT,
  "Area_Desenvolvimento_e_defesa_de_direitos_e_interesses" TEXT,
  "Area_Educacao_e_pesquisa" TEXT,
  "Area_Outras_atividades_associativas" TEXT,
  "Area_Religiao" TEXT,
  "Area_Saude" TEXT,
  "SubArea_Assistencia_social" TEXT,
  "SubArea_Associacoes_de_atividades_nao_especificadas_anteriormente" TEXT,
  "SubArea_Associacoes_de_produtores_rurais_pescadores_e_similares" TEXT,
  "SubArea_Associacoes_empresariais_e_patronais" TEXT,
  "SubArea_Associacoes_profissionais" TEXT,
  "SubArea_Atividades_de_apoio_a_educacao" TEXT,
  "SubArea_Cultura_e_arte" TEXT,
  "SubArea_Desenvolvimento_e_defesa_de_direitos" TEXT,
  "SubArea_Educacao_infantil" TEXT,
  "SubArea_Educacao_profissional" TEXT,
  "SubArea_Ensino_fundamental" TEXT,
  "SubArea_Ensino_superior" TEXT,
  "SubArea_Esportes_e_recreacao" TEXT,
  "SubArea_Estudos_e_pesquisas" TEXT,
  "SubArea_Hospitais" TEXT,
  "SubArea_Outras_formas_de_educacao_ensino" TEXT,
  "SubArea_Outros_servicos_de_saude" TEXT,
  "SubArea_Religiao" TEXT
);

COPY digital_products_mosc_import_raw
FROM '/tmp/20260522_MOSC_baseDivulgacao.csv'
WITH (FORMAT csv, HEADER true, DELIMITER ';', ENCODING 'LATIN1');

INSERT INTO digital_products_etl_runs (
  source_name,
  source_reference,
  status,
  started_at,
  finished_at,
  rows_read
)
SELECT
  'Mapa OSC',
  :'source_reference',
  'loaded_staging',
  NOW(),
  NOW(),
  COUNT(*)::int
FROM digital_products_mosc_import_raw;

INSERT INTO digital_products_mosc_orgs (
  cnpj,
  razao_social,
  nome_fantasia,
  natureza_juridica,
  matriz_filial,
  situacao_cadastral,
  data_fundacao,
  removida_do_mosc,
  data_fechamento,
  ano_fechamento,
  endereco,
  municipio_codigo,
  municipio,
  uf,
  longitude,
  latitude,
  cnae,
  cnae_secundaria,
  is_osc,
  source_reference,
  source_updated_at,
  record_hash,
  imported_at
)
SELECT
  REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g'),
  NULLIF(tx_razao_social_osc, ''),
  NULLIF(tx_nome_fantasia_osc, ''),
  NULLIF(natureza_juridica, ''),
  NULLIF(matriz_filial, ''),
  NULLIF(situacao_cadastral, ''),
  NULLIF(dt_fundacao_osc, '')::date,
  LOWER(removida_do_mosc) IN ('sim', 'true', '1'),
  NULLIF(data_fechamento, '')::date,
  NULLIF(ano_fechamento, '')::int,
  NULLIF(tx_endereco_completo, ''),
  NULLIF(cd_municipio, ''),
  NULLIF(municipio_nome, ''),
  NULLIF("UF_Sigla", ''),
  REPLACE(NULLIF(longitude, ''), ',', '.')::numeric,
  REPLACE(NULLIF(latitude, ''), ',', '.')::numeric,
  NULLIF(cnae, ''),
  NULLIF(cnae_secundaria, ''),
  TRUE,
  :'source_reference',
  DATE '2026-05-25',
  MD5(CONCAT_WS('|', cnpj, tx_razao_social_osc, municipio_nome, "UF_Sigla", longitude, latitude)),
  NOW()
FROM digital_products_mosc_import_raw
WHERE LENGTH(REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')) = 14
ON CONFLICT (cnpj) DO UPDATE SET
  razao_social = EXCLUDED.razao_social,
  nome_fantasia = EXCLUDED.nome_fantasia,
  natureza_juridica = EXCLUDED.natureza_juridica,
  matriz_filial = EXCLUDED.matriz_filial,
  situacao_cadastral = EXCLUDED.situacao_cadastral,
  data_fundacao = EXCLUDED.data_fundacao,
  removida_do_mosc = EXCLUDED.removida_do_mosc,
  data_fechamento = EXCLUDED.data_fechamento,
  ano_fechamento = EXCLUDED.ano_fechamento,
  endereco = EXCLUDED.endereco,
  municipio_codigo = EXCLUDED.municipio_codigo,
  municipio = EXCLUDED.municipio,
  uf = EXCLUDED.uf,
  longitude = EXCLUDED.longitude,
  latitude = EXCLUDED.latitude,
  cnae = EXCLUDED.cnae,
  cnae_secundaria = EXCLUDED.cnae_secundaria,
  source_reference = EXCLUDED.source_reference,
  source_updated_at = EXCLUDED.source_updated_at,
  record_hash = EXCLUDED.record_hash,
  imported_at = NOW();

DELETE FROM digital_products_mosc_areas
WHERE source_reference = :'source_reference';

INSERT INTO digital_products_mosc_areas (cnpj, tipo, nome, source_reference)
SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g'), area.tipo, area.nome, :'source_reference'
FROM digital_products_mosc_import_raw raw
CROSS JOIN LATERAL (VALUES
  ('area', 'Assistência social', raw."Area_Assistencia_social"),
  ('area', 'Associações patronais e profissionais', raw."Area_Associacoes_patronais_e_profissionais"),
  ('area', 'Cultura e recreação', raw."Area_Cultura_e_recreacao"),
  ('area', 'Desenvolvimento e defesa de direitos e interesses', raw."Area_Desenvolvimento_e_defesa_de_direitos_e_interesses"),
  ('area', 'Educação e pesquisa', raw."Area_Educacao_e_pesquisa"),
  ('area', 'Outras atividades associativas', raw."Area_Outras_atividades_associativas"),
  ('area', 'Religião', raw."Area_Religiao"),
  ('area', 'Saúde', raw."Area_Saude"),
  ('subarea', 'Assistência social', raw."SubArea_Assistencia_social"),
  ('subarea', 'Associações de atividades não especificadas anteriormente', raw."SubArea_Associacoes_de_atividades_nao_especificadas_anteriormente"),
  ('subarea', 'Associações de produtores rurais, pescadores e similares', raw."SubArea_Associacoes_de_produtores_rurais_pescadores_e_similares"),
  ('subarea', 'Associações empresariais e patronais', raw."SubArea_Associacoes_empresariais_e_patronais"),
  ('subarea', 'Associações profissionais', raw."SubArea_Associacoes_profissionais"),
  ('subarea', 'Atividades de apoio à educação', raw."SubArea_Atividades_de_apoio_a_educacao"),
  ('subarea', 'Cultura e arte', raw."SubArea_Cultura_e_arte"),
  ('subarea', 'Desenvolvimento e defesa de direitos', raw."SubArea_Desenvolvimento_e_defesa_de_direitos"),
  ('subarea', 'Educação infantil', raw."SubArea_Educacao_infantil"),
  ('subarea', 'Educação profissional', raw."SubArea_Educacao_profissional"),
  ('subarea', 'Ensino fundamental', raw."SubArea_Ensino_fundamental"),
  ('subarea', 'Ensino superior', raw."SubArea_Ensino_superior"),
  ('subarea', 'Esportes e recreação', raw."SubArea_Esportes_e_recreacao"),
  ('subarea', 'Estudos e pesquisas', raw."SubArea_Estudos_e_pesquisas"),
  ('subarea', 'Hospitais', raw."SubArea_Hospitais"),
  ('subarea', 'Outras formas de educação/ensino', raw."SubArea_Outras_formas_de_educacao_ensino"),
  ('subarea', 'Outros serviços de saúde', raw."SubArea_Outros_servicos_de_saude"),
  ('subarea', 'Religião', raw."SubArea_Religiao")
) AS area(tipo, nome, flag)
WHERE LENGTH(REGEXP_REPLACE(raw.cnpj, '[^0-9]', '', 'g')) = 14
  AND area.flag = '1'
ON CONFLICT (cnpj, tipo, nome) DO UPDATE SET
  source_reference = EXCLUDED.source_reference,
  imported_at = NOW();

ANALYZE digital_products_mosc_orgs;
ANALYZE digital_products_mosc_areas;

DROP TABLE digital_products_mosc_import_raw;
