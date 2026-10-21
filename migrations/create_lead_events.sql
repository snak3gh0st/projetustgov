-- Histórico de movimentação de leads (status, status de execução e atribuição).
--
-- Um trigger em vendedor_projetos grava cada mudança, de qualquer origem
-- (tela, distribuição, sync diário, scripts). Quem fez e de onde vem leem
-- as configurações de transação app.user_id / app.origem, definidas por
-- queryAs() em web/src/lib/db.ts. Sem elas, origem = 'sistema'.
--
-- Aplicar como dono da tabela (sigma_app), senão o app perde permissão de INSERT:
--   sudo -u postgres psql -d projetus_hub -c 'SET ROLE sigma_app' -f create_lead_events.sql

CREATE TABLE IF NOT EXISTS lead_events (
  id BIGSERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL,
  cnpj VARCHAR NOT NULL,
  nome TEXT,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('status', 'status_execucao', 'atribuicao')),
  valor_anterior TEXT,
  valor_novo TEXT,
  vendedor_anterior_id UUID,
  vendedor_novo_id UUID,
  -- Comissão do consultor que acompanha a atribuição de uma venda já fechada.
  comissao_valor NUMERIC,
  user_id UUID,
  origem VARCHAR(30) NOT NULL DEFAULT 'sistema',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_events_cnpj_created ON lead_events (cnpj, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_events_created ON lead_events (created_at DESC);

CREATE OR REPLACE FUNCTION log_lead_event() RETURNS trigger AS $$
DECLARE
  v_user UUID;
  v_origem TEXT;
BEGIN
  v_user := NULLIF(current_setting('app.user_id', true), '')::uuid;
  v_origem := COALESCE(NULLIF(current_setting('app.origem', true), ''), 'sistema');

  IF NEW.status_contato IS DISTINCT FROM OLD.status_contato THEN
    INSERT INTO lead_events (lead_id, cnpj, nome, tipo, valor_anterior, valor_novo, vendedor_novo_id, user_id, origem)
    VALUES (NEW.id, NEW.cnpj, NEW.nome, 'status', OLD.status_contato, NEW.status_contato, NEW.vendedor_id, v_user, v_origem);
  END IF;

  IF NEW.status_contato_execucao IS DISTINCT FROM OLD.status_contato_execucao THEN
    INSERT INTO lead_events (lead_id, cnpj, nome, tipo, valor_anterior, valor_novo, vendedor_novo_id, user_id, origem)
    VALUES (NEW.id, NEW.cnpj, NEW.nome, 'status_execucao', OLD.status_contato_execucao, NEW.status_contato_execucao, NEW.vendedor_id, v_user, v_origem);
  END IF;

  IF NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
    INSERT INTO lead_events (lead_id, cnpj, nome, tipo, vendedor_anterior_id, vendedor_novo_id, comissao_valor, user_id, origem)
    VALUES (
      NEW.id, NEW.cnpj, NEW.nome, 'atribuicao', OLD.vendedor_id, NEW.vendedor_id,
      CASE WHEN NEW.status_contato = 'Fechado' THEN NEW.comissao_valor END,
      v_user, v_origem
    );
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- O histórico nunca pode bloquear a gravação do lead.
  RAISE WARNING 'log_lead_event failed for vendedor_projetos.id=%: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_events ON vendedor_projetos;
CREATE TRIGGER trg_lead_events
  AFTER UPDATE OF status_contato, status_contato_execucao, vendedor_id ON vendedor_projetos
  FOR EACH ROW EXECUTE FUNCTION log_lead_event();
