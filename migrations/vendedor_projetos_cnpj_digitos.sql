-- CNPJ só com dígitos: WhatsApp (lista de conversas, Meu dia, ligação ao lead) compara o lead por
-- REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g'). Sem este índice cada conversa percorre todos os leads (0,65 s para 11 conversas).
-- CONCURRENTLY: não trava a gravação de leads; rodar fora de transação.
--   sudo -u postgres psql -d projetus_hub -f vendedor_projetos_cnpj_digitos.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vp_cnpj_digitos ON vendedor_projetos ((REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g')));
