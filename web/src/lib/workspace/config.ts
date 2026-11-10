import 'server-only'
import { WorkspaceError } from './domain'
import { keyBytes } from './security'

export const GOOGLE_SCOPES = ['openid','email','profile',
  'https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.events.freebusy','https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/drive']

export function googleConfig() {
  const clientId=process.env.GOOGLE_CLIENT_ID?.trim(),clientSecret=(process.env.GOOGLE_CLIENT_SECRET||process.env.GOOGLE_SECRET_KEY)?.trim()
  const encryptionKey=process.env.GOOGLE_WORKSPACE_TOKEN_ENCRYPTION_KEY?.trim()
  if(!clientId||!clientSecret||!encryptionKey)throw new WorkspaceError('A conexão Google ainda não foi configurada pelo administrador.',503)
  keyBytes(encryptionKey)
  const base=process.env.NEXTAUTH_URL||'https://projete.projetus.org'
  const redirectUri=process.env.GOOGLE_REDIRECT_URI||`${base.replace(/\/$/,'')}/api/integrations/google/callback`
  const url=new URL(redirectUri)
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new WorkspaceError('Endereço de retorno Google inválido.',503)
  return{clientId,clientSecret,encryptionKey,redirectUri,domain:process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase()||'projetus.org'}
}
export function googleReadiness(){try{googleConfig();return true}catch{return false}}
