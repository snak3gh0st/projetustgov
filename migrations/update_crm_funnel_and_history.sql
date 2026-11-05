-- CRM funnel revision: commercial stages are separate from historical reasons.
BEGIN;

ALTER TABLE vendedor_projetos
  ADD COLUMN IF NOT EXISTS venda_etapa VARCHAR(32);

UPDATE vendedor_projetos
SET venda_etapa = CASE
  WHEN tipo_servico = 'Aprovação' THEN 'aprovacao'
  ELSE 'execucao_prestacao'
END
WHERE status_contato = 'Fechado' AND venda_etapa IS NULL;

ALTER TABLE contact_notes
  DROP CONSTRAINT IF EXISTS contact_notes_tipo_check;

ALTER TABLE contact_notes
  ADD CONSTRAINT contact_notes_tipo_check
  CHECK (tipo IN ('ligacao', 'email', 'whatsapp', 'reuniao', 'outro', 'impedimento_tecnico', 'cancelamento'));

INSERT INTO contact_notes (lead_cnpj, vendedor_id, tipo, observacao)
SELECT vp.cnpj,
       vp.vendedor_id,
       CASE
         WHEN vp.status_contato IN ('Impedimento Técnico', 'Impedimento Tecnico') THEN 'impedimento_tecnico'
         ELSE 'cancelamento'
       END,
       CASE
         WHEN vp.status_contato IN ('Impedimento Técnico', 'Impedimento Tecnico')
           THEN 'Motivo legado do funil: impedimento técnico.'
         ELSE 'Motivo legado do funil: cancelamento.'
       END
FROM vendedor_projetos vp
WHERE vp.status_contato IN ('Impedimento Técnico', 'Impedimento Tecnico', 'Cancelado')
  AND NOT EXISTS (
    SELECT 1
    FROM contact_notes cn
    WHERE cn.lead_cnpj = vp.cnpj
      AND cn.tipo = CASE
        WHEN vp.status_contato IN ('Impedimento Técnico', 'Impedimento Tecnico') THEN 'impedimento_tecnico'
        ELSE 'cancelamento'
      END
      AND cn.observacao LIKE 'Motivo legado do funil:%'
  );

UPDATE vendedor_projetos
SET status_contato = 'Em Atendimento', updated_at = NOW()
WHERE status_contato IN ('Impedimento Técnico', 'Impedimento Tecnico', 'Cancelado');

COMMIT;
