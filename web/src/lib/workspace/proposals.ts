import { emailAddress } from './domain.ts'

export function isProposal(subject: string, marked = false): boolean {
  return marked || /\bpropostas?\b/i.test(subject.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
}

export function proposalCopy(subject: string, marked: boolean, from: string, to: string[], env = process.env): string[] {
  if (!isProposal(subject, marked)) return []
  const manager = emailAddress(env.PROPOSAL_COPY_EMAIL || env.PRIMARY_LEAD_MANAGER_EMAIL || 'comercial@projetus.org')
  return [from, ...to].some((v) => v.toLowerCase() === manager) ? [] : [manager]
}
