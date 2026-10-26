-- WhatsApp das consultorias: histórico de 1 ano e espelhamento das etiquetas do WhatsApp Business.
--
-- lid: identificador do contato no WhatsApp (…@lid). O histórico e as etiquetas chegam por ele, sem telefone.
-- historico_ate: mensagens recebidas até esse instante vieram do histórico e não contam como "esperando resposta".
-- whatsapp_etiquetas: nomes e usuário associado para consulta. whatsapp_chat_etiquetas: qual etiqueta está em qual chat.
-- Etiquetas não atribuem nem redistribuem conversas; o atendente é escolhido pela gestão.
--
-- Aplicar ANTES do deploy:
--   sudo -u postgres psql -d projetus_hub -f whatsapp_historico_etiquetas.sql

ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS lid TEXT;
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS historico_ate TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_conversas_lid ON whatsapp_conversas (instancia, lid) WHERE lid IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_etiquetas (
  instancia TEXT NOT NULL,
  label_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (instancia, label_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_chat_etiquetas (
  instancia TEXT NOT NULL,
  chat_jid TEXT NOT NULL,
  label_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (instancia, chat_jid, label_id)
);

INSERT INTO whatsapp_etiquetas (instancia, label_id, nome, user_id)
SELECT 'consultorias', '4', 'ANA GRACIELE', (SELECT id FROM users WHERE nome = 'Ana Graciele' LIMIT 1)
ON CONFLICT DO NOTHING;
INSERT INTO whatsapp_etiquetas (instancia, label_id, nome, user_id)
SELECT 'consultorias', '5', 'ELISSON CRUZ', (SELECT id FROM users WHERE nome = 'Elisson' LIMIT 1)
ON CONFLICT DO NOTHING;

ALTER TABLE whatsapp_etiquetas OWNER TO sigma_app;
ALTER TABLE whatsapp_chat_etiquetas OWNER TO sigma_app;
