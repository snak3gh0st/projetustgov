-- Apply before deploying the commercial attendance changes. No messages or assignments are removed.
BEGIN;
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS resolvida_ate TIMESTAMPTZ;
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS ultima_recebida_id BIGINT;
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS resolvida_em TIMESTAMPTZ;
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS resolvida_por UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE vendedor_projetos ADD COLUMN IF NOT EXISTS perda_motivo TEXT;
ALTER TABLE vendedor_projetos ADD COLUMN IF NOT EXISTS perda_em TIMESTAMPTZ;
ALTER TABLE vendedor_projetos ADD COLUMN IF NOT EXISTS perda_por UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS whatsapp_fila_aberta ON whatsapp_conversas(instancia, ultima_mensagem_em DESC)
  WHERE lead_cnpj IS NULL AND atendente_id IS NULL AND arquivada_em IS NULL;
CREATE INDEX IF NOT EXISTS whatsapp_reacoes_alvo ON whatsapp_mensagens
  (conversa_id, (midia->>'alvoWaId'), direcao, enviada_em DESC, id DESC) WHERE tipo = 'reacao';
COMMIT;
