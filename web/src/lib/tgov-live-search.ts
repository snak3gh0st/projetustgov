import { cleanCNPJ, downloadAndStreamCSV, fixText, parseBRNumber } from '@/lib/repo-sync'

const REPO_BASE = 'https://repositorio.dados.gov.br/seges/detru'
const PROPOSTA_URL = `${REPO_BASE}/siconv_proposta.csv.zip`

export interface LivePropostaResult {
  transferGovId: string
  nrProposta: string
  titulo: string | null
  proponente: string | null
  proponenteCnpj: string
  situacao: string | null
  valorGlobal: number | null
  valorRepasse: number | null
  valorContrapartida: number | null
  uf: string | null
  municipio: string | null
  dataPublicacao: string | null
  modalidade: string | null
  orgaoSuperior: string | null
  orgaoVinculado: string | null
}

function parseBRDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parts = trimmed.split('/')
  if (parts.length === 3 && parts[0].length <= 2) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return trimmed
}

export async function searchLivePropostas(params: {
  cnpj?: string
  nrProposta?: string
  limit?: number
}): Promise<LivePropostaResult[]> {
  const cnpj = params.cnpj ? params.cnpj.replace(/\D/g, '') : ''
  const nrProposta = params.nrProposta ? params.nrProposta.replace(/^0+/, '').trim() : ''
  const limit = Math.max(1, params.limit ?? (nrProposta ? 1 : 50))

  if (!cnpj && !nrProposta) return []

  const hits: LivePropostaResult[] = []

  await downloadAndStreamCSV(PROPOSTA_URL, (row) => {
    const rowCnpj = cleanCNPJ(row['IDENTIF_PROPONENTE'] || row['CNPJ_PROPONENTE'] || null)
    const rowNrProposta = (row['NR_PROPOSTA'] || '').replace(/^0+/, '').trim()
    if (!rowCnpj || !rowNrProposta) return

    const cnpjMatch = cnpj ? rowCnpj === cnpj : false
    const nrMatch = nrProposta ? rowNrProposta === nrProposta : false
    if (!cnpjMatch && !nrMatch) return

    hits.push({
      transferGovId: row['ID_PROPOSTA'],
      nrProposta: rowNrProposta,
      titulo: fixText(row['OBJETO_PROPOSTA'] || row['DESC_OBJETO'] || null) || null,
      proponente: fixText(row['NM_PROPONENTE'] || row['NOME_PROPONENTE'] || null) || null,
      proponenteCnpj: rowCnpj,
      situacao: fixText(row['SIT_PROPOSTA'] || row['SITUACAO_PROPOSTA'] || null) || null,
      valorGlobal: Number.isFinite(parseBRNumber(row['VL_GLOBAL_PROP'])) ? parseBRNumber(row['VL_GLOBAL_PROP']) : null,
      valorRepasse: Number.isFinite(parseBRNumber(row['VL_REPASSE_PROP'])) ? parseBRNumber(row['VL_REPASSE_PROP']) : null,
      valorContrapartida: Number.isFinite(parseBRNumber(row['VL_CONTRAPARTIDA_PROP'])) ? parseBRNumber(row['VL_CONTRAPARTIDA_PROP']) : null,
      uf: row['UF_PROPONENTE'] || row['UF'] || null,
      municipio: fixText(row['MUNICIPIO_PROPONENTE'] || row['MUNIC_PROPONENTE'] || null) || null,
      dataPublicacao: parseBRDate(row['DIA_PROPOSTA'] || row['DIA_PROP'] || null),
      modalidade: fixText(row['MODALIDADE'] || null) || null,
      orgaoSuperior: fixText(row['DESC_ORGAO_SUP'] || null) || null,
      orgaoVinculado: fixText(row['DESC_ORGAO'] || null) || null,
    })

    return hits.length < limit
  })

  return hits
}
