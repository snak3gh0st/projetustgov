-- Phase 21: Add execution roles (coord_execucao, assistente_execucao, projetista_execucao)
-- Drop and recreate constraint with all 13 roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'gestor', 'admin', 'vendedor', 'visualizador', 'coordenador',
    'adm_produto', 'csm',
    'coord_aprovacao', 'assistente_aprovacao', 'projetista',
    'coord_execucao', 'assistente_execucao', 'projetista_execucao'
  ));
