-- Papel "diretoria" (gestão da empresa: Philipe e Tito). O papel "gestor" passa a ser só o gestor comercial.
BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'gestor', 'admin', 'vendedor', 'visualizador', 'coordenador',
  'adm_produto', 'csm',
  'coord_aprovacao', 'assistente_aprovacao', 'projetista',
  'coord_execucao', 'assistente_execucao',
  'coord_prestacao', 'assistente_prestacao',
  'gestor_financeiro', 'diretoria'
));

COMMIT;

-- Produção, passo seguinte: rodar só com OK do Paulo e pedir novo login aos dois
-- (o papel no token só é relido do banco a cada hora).
-- UPDATE users SET role = 'diretoria' WHERE nome IN ('Philipe', 'Tito') AND role = 'gestor';
