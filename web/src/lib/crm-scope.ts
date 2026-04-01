/**
 * Rows in vendedor_projetos that only contain bare CRM registration data
 * (e.g. cnpj + nome + owner/status) should not count as approval/TGov scope.
 *
 * This isolates the 2026-03-25 anomalous batch without relying on dates.
 */
export function buildStructuredLeadScopeSql(alias = 'vp'): string {
  return `(
    NULLIF(TRIM(${alias}.codigo_programa), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.nome_programa), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.link_externo), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.orgao_concedente), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.qualificacao), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.nr_emenda), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.parlamentar), '') IS NOT NULL OR
    ${alias}.valor_emenda IS NOT NULL OR
    ${alias}.valor_global IS NOT NULL OR
    ${alias}.valor_empenhado IS NOT NULL OR
    ${alias}.valor_liberado IS NOT NULL OR
    NULLIF(TRIM(${alias}.nr_convenio), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.objeto), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.modalidade), '') IS NOT NULL OR
    NULLIF(TRIM(${alias}.situacao), '') IS NOT NULL OR
    ${alias}.saldo_conta IS NOT NULL
  )`
}
