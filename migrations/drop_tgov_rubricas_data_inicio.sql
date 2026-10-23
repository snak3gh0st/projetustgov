-- Rubricas não usam mais data de início (pedido do time de Aprovação, 23/10/2026).
-- Aplicar DEPOIS do deploy que para de ler a coluna.
ALTER TABLE tgov_rubricas DROP COLUMN IF EXISTS data_inicio;
