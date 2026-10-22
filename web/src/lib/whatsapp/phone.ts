// Telefones brasileiros para o WhatsApp: o mesmo celular aparece com e sem o 55, com e sem o 9.

/** Dígitos locais (DDD + número), sem o 55; null se não for um telefone brasileiro completo. */
function localDigits(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  // 0 de longa distância, com ou sem os dois dígitos da operadora ("061…", "0 15 61…").
  if (d.startsWith('0')) d = d.slice(d.length === 13 || d.length === 14 ? 3 : 1)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if ((d.length !== 10 && d.length !== 11) || d.startsWith('0')) return null
  return d
}

// Celular: o número começa com 6 a 9; com 11 dígitos, o 9 extra vem antes.
const isMobileWithout9 = (local: string) => local.length === 10 && /[6-9]/.test(local[2])
const isMobileWith9 = (local: string) => local.length === 11 && local[2] === '9' && /[6-9]/.test(local[3])

/** '55' + DDD + número, com o 9 nos celulares; null se inválido. */
export function canonicalPhone(raw: string | null | undefined): string | null {
  const local = localDigits(raw)
  if (!local) return null
  if (isMobileWithout9(local)) return `55${local.slice(0, 2)}9${local.slice(2)}`
  return `55${local}`
}

/** Formas locais do mesmo número para comparar com o que está gravado (com e sem o 9 do celular). */
export function phoneVariants(raw: string | null | undefined): string[] {
  const local = localDigits(raw)
  if (!local) return []
  if (isMobileWithout9(local)) return [local, `${local.slice(0, 2)}9${local.slice(2)}`]
  if (isMobileWith9(local)) return [local, `${local.slice(0, 2)}${local.slice(3)}`]
  return [local]
}

/** Telefone canônico de um JID de contato; grupos, @lid e broadcast não têm telefone. */
export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return null
  return canonicalPhone(jid.split('@')[0])
}

/** SQL: dígitos locais de uma coluna de telefone, com as mesmas regras de localDigits (0 + operadora, 55). */
export const localPhoneSql = (col: string) =>
  `REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(${col}, ''), '\\D', '', 'g'), '^0(\\d{2})?(\\d{10,11})$', '\\2'), '^55(\\d{10,11})$', '\\1')`
