-- WhatsApp das consultorias (Evolution API): conversas e mensagens.
--
-- Uma conversa por número de contato em cada instância (número do WhatsApp ligado).
-- lead_cnpj liga a conversa ao lead pelo telefone; atendente_id é o direcionamento do gestor.
--
-- Aplicar ANTES do deploy (Leads, Execução e Meu dia leem estas tabelas quando o canal está configurado):
--   sudo -u postgres psql -d projetus_hub -f create_whatsapp.sql
-- O fim do arquivo passa as tabelas (e as sequências) para sigma_app, o usuário do app.

CREATE TABLE IF NOT EXISTS whatsapp_conversas (
  id BIGSERIAL PRIMARY KEY,
  instancia TEXT NOT NULL,
  -- 55 + DDD + número, só dígitos; sem telefone resolvível, o JID do contato.
  telefone TEXT NOT NULL,
  jid TEXT NOT NULL,
  nome_contato TEXT,
  lead_cnpj TEXT,
  atendente_id UUID REFERENCES users(id) ON DELETE SET NULL,
  arquivada_em TIMESTAMPTZ,
  ultima_recebida_em TIMESTAMPTZ,
  ultima_enviada_em TIMESTAMPTZ,
  ultima_mensagem_em TIMESTAMPTZ,
  ultima_previa TEXT,
  nao_lidas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instancia, telefone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_lead ON whatsapp_conversas (lead_cnpj);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_atendente ON whatsapp_conversas (atendente_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_ultima ON whatsapp_conversas (ultima_mensagem_em DESC);

CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id BIGSERIAL PRIMARY KEY,
  conversa_id BIGINT NOT NULL REFERENCES whatsapp_conversas(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('recebida', 'enviada')),
  -- contato: veio do lead; projete: enviada pela tela; celular: enviada direto no aparelho.
  origem TEXT NOT NULL CHECK (origem IN ('contato', 'projete', 'celular')),
  autor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  texto TEXT,
  tipo TEXT NOT NULL DEFAULT 'texto',
  midia JSONB,
  status TEXT NOT NULL DEFAULT 'enviada' CHECK (status IN ('enviando', 'enviada', 'entregue', 'lida', 'falhou')),
  enviada_em TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversa_id, wa_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_conversa ON whatsapp_mensagens (conversa_id, enviada_em);

ALTER TABLE whatsapp_conversas OWNER TO sigma_app;
ALTER TABLE whatsapp_mensagens OWNER TO sigma_app;
