# Quick Task 7: Agrupamento por CNPJ na Distribuicao

**Commit:** 9c5f50f
**Files modified:** 2

## What was done

CNPJ-based grouping for lead distribution: when a gestor assigns leads to a vendedor, all leads sharing the same CNPJ are automatically included.

### Backend (`/api/leads/assign`)
- Extracts distinct CNPJs from selected lead_ids
- Updates ALL unassigned leads with those CNPJs (not just selected ones)
- Detects conflicts: if a CNPJ already has leads assigned to a different vendedor, returns warnings array
- Response includes `assigned_count`, `selected_count`, `extra_by_cnpj`, `warnings`

### Frontend (`/distribuir`)
- New "Leads" column showing count of leads per CNPJ (highlights >1 in cyan)
- Real-time banner: "X leads adicionais do mesmo CNPJ serao incluidos automaticamente"
- Bottom bar shows `(+N por CNPJ)` count
- Button label includes total (selected + extra)
- Toast shows extra count and any warnings after assignment

## Deviations from Plan

None - task executed exactly as specified.
