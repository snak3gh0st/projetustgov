// Transferegov open-data download area (Discricionárias e Legais / SICONV).
//
// Comunicado Transferegov nº 23/2026 (17/07/2026) moved the files from
// repositorio.dados.gov.br/seges/detru to the new api-publica host. The old
// host stopped updating on 17/07/2026. Files keep the same CSV layout; only the
// name changed: siconv_<tabela>.csv.zip -> siconv_<tabela>.zip.

export const TGOV_REPO_BASE = 'https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov'

export function tgovRepoFile(tabela: string): string {
  return `${TGOV_REPO_BASE}/${tabela}.zip`
}
