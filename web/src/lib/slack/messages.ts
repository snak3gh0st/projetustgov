import type { SlackMessage } from './client'
import type { CommercialActivityRow } from '../commercial-activity'
const base = 'https://projete.projetus.org'
const safe = (v: string) => v.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
const section = (text: string) => ({ type: 'section', text: { type: 'plain_text', text: text.slice(0, 2900) } })
const button = (label: string, url: string) => ({ type: 'actions', elements: [{ type: 'button', action_id: 'projete_open', text: { type: 'plain_text', text: label }, url }] })
const mention = (user: string | null) => user ? [{ type: 'section', text: { type: 'mrkdwn', text: `<@${user}>` } }] : []
export function approvalMessage(row: { nome: string; cnpj: string; lead_id: number; consultor: string | null }, user: string | null): SlackMessage {
  const cnpj = row.cnpj.replace(/\D/g, '')
  const text = `Proposta aguardando aprovação\nCliente: ${row.nome}\nConsultor: ${row.consultor || 'Não identificado'}\nOportunidade: ${row.lead_id}`
  return { text: safe(text), blocks: [...mention(user), section(text), button('Revisar na Projete', `${base}/lead/${encodeURIComponent(cnpj)}`)] }
}
export function dailyMessage(day: string, time: string, rows: CommercialActivityRow[], approvals: number): SlackMessage {
  const sum = (key: 'contatos' | 'movimentados' | 'perdas' | 'ligacoes_manuais') => rows.reduce((s, r) => s + Number(r[key]), 0)
  const header = `Projete · Resumo comercial ${day.split('-').reverse().join('/')} até ${time} (Brasília)`
  const summary = `Contatos somados por consultor: ${sum('contatos')}\nOportunidades movimentadas: ${sum('movimentados')}\nPerdas registradas: ${sum('perdas')}\nLigações registradas manualmente: ${sum('ligacoes_manuais')}\nEm aprovação no momento da geração: ${approvals}`
  const active = rows.filter(r => r.registros || r.movimentados).sort((a, b) => b.contatos - a.contatos || a.nome.localeCompare(b.nome))
  const details = active.slice(0, 20).map(r => `${r.nome}: ${r.contatos} contatos · ${r.movimentados} movimentações · ${r.perdas} perdas`)
  if (active.length > 20) details.push(`Mais ${active.length - 20} consultores no BI.`)
  return { text: safe(`${header}\n${summary}`), blocks: [section(header), section(summary), ...(details.length ? [section(details.join('\n'))] : []), section('Contatos são contados por consultor; um mesmo cliente pode aparecer em mais de uma carteira. O painel é atualizado na Projete.'), button('Abrir BI comercial', `${base}/bi`)] }
}
export type ConnectionState = 'conectado' | 'conectando' | 'desconectado' | 'indisponivel'
export function connectionMessage(label: string, state: ConnectionState, recovered: boolean, user: string | null): SlackMessage {
  const header = recovered ? `WhatsApp restabelecido · ${label}` : `WhatsApp requer atenção · ${label}`
  const detail = recovered ? 'A Projete voltou a confirmar a conexão com o provedor.' : state === 'indisponivel' ? 'Não foi possível consultar o provedor por pelo menos dois minutos. Isso não confirma que o telefone foi desconectado.' : state === 'conectando' ? 'O pareamento não foi concluído por pelo menos dois minutos. Confira a conexão na Projete.' : 'O provedor informa desconexão há pelo menos dois minutos. Confira o pareamento na Projete.'
  return { text: safe(`${header}\n${detail}`), blocks: [...mention(user), section(header), section(detail), button('Ver conexão', `${base}/conversas`)] }
}
export interface ConnectionObservation { badSince: Date | null; incident: string | null; lastChecked: Date }
export function connectionTransition(previous: ConnectionObservation | null, state: ConnectionState, now: Date): 'ignore' | 'healthy' | 'pending' | 'down' | 'recovered' {
  if (previous && now.getTime() - previous.lastChecked.getTime() < 30000) return 'ignore'
  if (state === 'conectado') return previous?.incident ? 'recovered' : 'healthy'
  if (previous?.incident) return 'pending'
  return previous?.badSince && now.getTime() - previous.badSince.getTime() >= 120000 ? 'down' : 'pending'
}
