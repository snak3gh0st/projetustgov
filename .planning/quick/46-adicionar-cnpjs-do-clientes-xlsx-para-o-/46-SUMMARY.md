# Quick Task 46 Summary

**Task:** Adicionar CNPJs do CLIENTES.xlsx para o Paulo
**Date:** 2026-02-23
**Status:** Complete

## What Was Done

Extracted 76 unique CNPJs from `/Users/pauloloureiro/Downloads/CLIENTES.xlsx` (sheets: A RECEBER, 2025 A RECEBER, 2024 A RECEBER, 2024) and assigned them to Paulo Gabriel (paulo@projetus.org, gestor_vendedor).

## Results

| Category | Count |
|----------|-------|
| Total CNPJs in file | 76 |
| Found in DB | 20 |
| Already assigned to Paulo | 8 |
| Reassigned to Paulo | 12 (14 rows) |
| Not found in DB | 56 |

## Reassigned CNPJs (12 CNPJs → Paulo)

| CNPJ | Previous Assignee |
|------|-------------------|
| 03412091000160 | Gabriel |
| 08466173000101 | Elisson |
| 08836901000120 | Vitoria |
| 11423403000160 | Wellington |
| 17652052000145 | Wellington |
| 17691694000153 | Vitoria |
| 17704372000100 | Elisson |
| 18133211000168 | Wellington |
| 22415807000128 | Elisson |
| 26509885000142 | Elisson |
| 41771121000114 | Gabriel |
| 51561819000169 | Wellington |

## Not Found in DB (56 CNPJs)

These CNPJs exist in the spreadsheet but are not present in `vendedor_projetos`. They may not have emendas in the current sync cycle.

## Script Created

`web/scripts/assign-paulo-cnpjs.mjs` — reusable for future reassignments.
