-- Workspace resources remain linked to existing CRM clients and project records.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('projete_google_workspace_20261110'));
CREATE TABLE IF NOT EXISTS google_workspace_connections (
  user_id UUID PRIMARY KEY REFERENCES users(id), google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL, domain TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','reauth_required','disconnected')),
  access_token_encrypted TEXT, refresh_token_encrypted TEXT, expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}', version INT NOT NULL DEFAULT 1,
  refresh_lock UUID, refresh_until TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cnpj TEXT NOT NULL CHECK(cnpj ~ '^\d{14}$'),
  project_kind TEXT NOT NULL CHECK(project_kind IN ('cliente','comercial','convenio')),
  project_key TEXT NOT NULL DEFAULT '', folder_id TEXT, folder_name TEXT,
  folder_bound_by UUID REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cnpj,project_kind,project_key), CHECK(project_kind<>'cliente' OR project_key='')
);
CREATE TABLE IF NOT EXISTS workspace_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), context_id UUID NOT NULL REFERENCES workspace_contexts(id),
  user_id UUID NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('thread','event')),
  remote_id TEXT NOT NULL, google_sub TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(context_id,user_id,kind,remote_id,google_sub)
);
CREATE TABLE IF NOT EXISTS workspace_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), context_id UUID NOT NULL REFERENCES workspace_contexts(id),
  file_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL, version TEXT NOT NULL,
  type_label TEXT NOT NULL DEFAULT 'Documento', review_status TEXT NOT NULL DEFAULT 'received'
    CHECK(review_status IN ('received','review','approved','rejected')),
  reviewed_version TEXT, reviewed_by UUID REFERENCES users(id), review_note TEXT,
  created_by UUID NOT NULL REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(context_id,file_id), CHECK(review_status<>'approved' OR (reviewed_version IS NOT NULL AND reviewed_version=version AND reviewed_by IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS workspace_activity (
  id BIGSERIAL PRIMARY KEY, context_id UUID NOT NULL REFERENCES workspace_contexts(id),
  actor_id UUID NOT NULL REFERENCES users(id), private_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL, summary TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_activity_context ON workspace_activity(context_id,created_at DESC);
CREATE TABLE IF NOT EXISTS workspace_operations (
  request_id UUID NOT NULL, user_id UUID NOT NULL REFERENCES users(id), context_id UUID NOT NULL REFERENCES workspace_contexts(id),
  kind TEXT NOT NULL, google_sub TEXT NOT NULL, payload_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('processing','done','failed','uncertain')),
  response JSONB, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_one_folder_creation ON workspace_operations(context_id)
  WHERE kind='create_folder' AND status IN ('processing','done','uncertain');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sigma_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON google_workspace_connections,workspace_contexts,workspace_links,
      workspace_documents,workspace_activity,workspace_operations TO sigma_app;
    GRANT USAGE,SELECT ON SEQUENCE workspace_activity_id_seq TO sigma_app;
  END IF;
END $$;
COMMIT;
