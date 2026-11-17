-- Apply before publishing QR locking and connection-event recording.
CREATE TABLE IF NOT EXISTS whatsapp_conexao_estado (
  instancia TEXT PRIMARY KEY,
  estado TEXT,
  codigo INTEGER,
  recebido_em TIMESTAMPTZ,
  ultimo_pareamento_em TIMESTAMPTZ
);
ALTER TABLE whatsapp_conexao_estado OWNER TO sigma_app;

CREATE TABLE IF NOT EXISTS whatsapp_conexao_eventos (
  id BIGSERIAL PRIMARY KEY,
  instancia TEXT NOT NULL,
  estado TEXT NOT NULL,
  codigo INTEGER,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_conexao_eventos_instancia_em ON whatsapp_conexao_eventos(instancia, recebido_em DESC);
ALTER TABLE whatsapp_conexao_eventos OWNER TO sigma_app;
