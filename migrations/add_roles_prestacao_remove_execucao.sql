-- Substitui os 3 roles de execução (coord_execucao, assistente_execucao,
-- projetista_execucao) pelos 2 roles de prestação (coord_prestacao,
-- assistente_prestacao). Zero usuários usam os roles removidos.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'gestor', 'admin', 'vendedor', 'visualizador', 'coordenador',
    'adm_produto', 'csm',
    'coord_aprovacao', 'assistente_aprovacao', 'projetista',
    'coord_prestacao', 'assistente_prestacao'
  ));
