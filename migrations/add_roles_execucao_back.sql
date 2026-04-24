-- Re-adiciona os roles de Execução (coord_execucao, assistente_execucao) à
-- constraint users_role_check. Mantém os roles de Aprovação e Prestação.
-- Padrão Aprovação: coord + assistente (sem projetista para execução).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'gestor', 'admin', 'vendedor', 'visualizador', 'coordenador',
    'adm_produto', 'csm',
    'coord_aprovacao', 'assistente_aprovacao', 'projetista',
    'coord_execucao', 'assistente_execucao',
    'coord_prestacao', 'assistente_prestacao'
  ));
