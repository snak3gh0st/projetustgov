-- Quando o convênio apareceu pela primeira vez no PROJETE: a Execução marca "Novo" (últimos 7 dias)
-- para a distribuição não misturar os novos com os antigos. synced_at não serve: o sync o reescreve todo dia.
-- Sem DEFAULT no ADD COLUMN: o default seria gravado em todas as linhas antigas e tudo pareceria novo.
-- O upsert do sync não lista a coluna: o INSERT usa o default e o ON CONFLICT não a toca.
--   sudo -u postgres psql -d projetus_hub -f projetos_execucao_primeira_vez_em.sql

SET lock_timeout = '5s';

ALTER TABLE projetos_execucao ADD COLUMN IF NOT EXISTS primeira_vez_em TIMESTAMPTZ;
ALTER TABLE projetos_execucao ALTER COLUMN primeira_vez_em SET DEFAULT NOW();

-- Os 3.222 convênios que entraram com o espelho do Transferegov em 26/10/2026 (ids a partir de 4487713).
UPDATE projetos_execucao
SET primeira_vez_em = '2026-10-26 11:00:00-03'
WHERE id >= 4487713 AND primeira_vez_em IS NULL;
