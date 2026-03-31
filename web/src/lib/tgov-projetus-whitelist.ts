/**
 * 2026 Aprovação proposal numbers from Gustavo.
 * Format: NR_PROPOSTA (without /year suffix).
 * These are used to filter the Aprovação tab for 2026 proposals.
 *
 * The Execução tab no longer uses a hardcoded whitelist — it dynamically
 * filters by Projetus client CNPJs from existing_clients + vendedor_projetos.
 */
export const APROVACAO_2026_PROPOSTAS: string[] = [
  '3677', '9015', '11385', '8887', '9142', '9144', '10955', '10930',
  '8301', '8304', '8760', '8815', '10437', '11051', '11291', '9087',
  '11297', '11000', '5645', '7945', '7609', '6654', '11099', '5373',
  '11067', '8959', '9855', '11255', '10294', '9843', '9178', '7263',
  '7236', '11304', '8165', '7612', '8913', '3378', '11305', '11331',
  '11068', '3514', '6217', '9878', '9856', '10900', '5476', '7177',
  '8948', '9215', '11201', '7618', '9227', '10943', '11264', '11072',
  '11350', '8903', '10150',
]
