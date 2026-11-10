import 'server-only'
import { randomUUID } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { googleConfig, GOOGLE_SCOPES } from './config'
import { WorkspaceError } from './domain'
import { seal, unseal, validateGoogleIdentity } from './security'
import type { WorkspaceStore } from './store'

const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
async function tokenRequest(params:Record<string,string>){
  let r:Response
  try{r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(params),cache:'no-store',signal:AbortSignal.timeout(18000)})}
  catch{throw new WorkspaceError('O Google não respondeu à autorização. Tente conectar novamente.',502)}
  const data=await r.json().catch(()=>({}))
  if(!r.ok)throw new WorkspaceError(data.error==='invalid_grant'?'A autorização Google expirou. Reconecte sua conta.':'Não foi possível autorizar esta conta Google.',data.error==='invalid_grant'?401:502)
  if(typeof data.access_token!=='string'||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<1)throw new WorkspaceError('O Google não retornou uma autorização válida.',502)
  return data
}
export function authorizationUrl(input:{state:string;challenge:string;email?:string|null}){
  const c=googleConfig(),url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
  const query={client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:GOOGLE_SCOPES.join(' '),
    access_type:'offline',prompt:'consent select_account',include_granted_scopes:'true',state:input.state,nonce:input.state,
    code_challenge:input.challenge,code_challenge_method:'S256',hd:c.domain,...(input.email?{login_hint:input.email}:{})}
  for(const[k,v]of Object.entries(query))url.searchParams.set(k,v)
  return url.toString()
}
export async function completeAuthorization(store:WorkspaceStore,userId:string,code:string,verifier:string,nonce:string){
  const c=googleConfig(),tokens=await tokenRequest({client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,
    grant_type:'authorization_code',code,code_verifier:verifier})
  if(typeof tokens.id_token!=='string')throw new WorkspaceError('A identidade da conta Google não foi confirmada.',403)
  let claims
  try{claims=(await jwtVerify(tokens.id_token,keys,{audience:c.clientId,issuer:['https://accounts.google.com','accounts.google.com'],algorithms:['RS256']})).payload}
  catch{throw new WorkspaceError('A assinatura da identidade Google não é válida.',403)}
  if(claims.azp&&claims.azp!==c.clientId)throw new WorkspaceError('A autorização pertence a outro aplicativo.',403)
  const identity=validateGoogleIdentity(claims,nonce,c.domain),old=await store.connection(userId)
  const scopes=String(tokens.scope??'').split(/\s+/).filter(Boolean)
  if(GOOGLE_SCOPES.filter(s=>s.startsWith('https://www.googleapis.com/auth/')).some(s=>!scopes.includes(s)))throw new WorkspaceError('Autorize os acessos solicitados de Gmail, Drive e Agenda para concluir a conexão.',403)
  if(old&&old.google_sub!==identity.sub&&old.status!=='disconnected')throw new WorkspaceError('Desconecte a conta Google anterior antes de vincular outra identidade.',409)
  const purpose=`google-token:${userId}`
  const refresh=typeof tokens.refresh_token==='string'?seal(tokens.refresh_token,c.encryptionKey,purpose)
    :old?.google_sub===identity.sub?old.refresh_token_encrypted:null
  if(!refresh)throw new WorkspaceError('O Google não liberou acesso contínuo. Conecte novamente e autorize o acesso.',409)
  await store.saveConnection({userId,...identity,access:seal(tokens.access_token,c.encryptionKey,purpose),refresh,
    expiresAt:new Date(Date.now()+Number(tokens.expires_in)*1000),scopes})
}
export async function accessToken(store:WorkspaceStore,userId:string){
  const config=googleConfig(),purpose=`google-token:${userId}`
  for(let i=0;i<85;i++){
    const c=await store.connection(userId)
    if(!c||c.status!=='active'||!c.refresh_token_encrypted)throw new WorkspaceError('Conecte sua conta Google para usar o Workspace.',409)
    if(c.access_token_encrypted&&new Date(c.expires_at).getTime()>Date.now()+60000)return unseal(c.access_token_encrypted,config.encryptionKey,purpose)
    const lock=randomUUID()
    const claimed=await store.rows(`UPDATE google_workspace_connections SET refresh_lock=$3,refresh_until=now()+interval '60 seconds'
      WHERE user_id=$1 AND version=$2 AND status='active' AND (refresh_until IS NULL OR refresh_until<now()) RETURNING user_id`,[userId,c.version,lock])
    if(!claimed.length){await new Promise(resolve=>setTimeout(resolve,250));continue}
    try{
      const tokens=await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'refresh_token',
        refresh_token:unseal(c.refresh_token_encrypted,config.encryptionKey,purpose)})
      const saved=await store.rows(`UPDATE google_workspace_connections SET access_token_encrypted=$4,expires_at=$5,
        refresh_token_encrypted=$6,version=version+1,refresh_lock=NULL,refresh_until=NULL,updated_at=now()
        WHERE user_id=$1 AND version=$2 AND refresh_lock=$3 AND status='active' RETURNING user_id`,
      [userId,c.version,lock,seal(tokens.access_token,config.encryptionKey,purpose),new Date(Date.now()+Number(tokens.expires_in)*1000),
        tokens.refresh_token?seal(tokens.refresh_token,config.encryptionKey,purpose):c.refresh_token_encrypted])
      if(!saved.length)throw new WorkspaceError('A conexão mudou durante a autorização. Atualize a página.',409)
      return tokens.access_token as string
    }catch(e){
      if(e instanceof WorkspaceError&&e.status===401)await store.rows("UPDATE google_workspace_connections SET status='reauth_required',updated_at=now() WHERE user_id=$1 AND version=$2 AND refresh_lock=$3",[userId,c.version,lock])
      throw e
    }finally{await store.rows('UPDATE google_workspace_connections SET refresh_lock=NULL,refresh_until=NULL WHERE user_id=$1 AND refresh_lock=$2',[userId,lock])}
  }
  throw new WorkspaceError('Sua autorização Google está sendo renovada. Tente novamente em instantes.',409)
}
export async function disconnectGoogle(store:WorkspaceStore,userId:string){
  // Detach locally first. Do not revoke a Google grant that another integration may share.
  await store.rows(`UPDATE google_workspace_connections SET status='disconnected',access_token_encrypted=NULL,
    refresh_token_encrypted=NULL,expires_at=NULL,version=version+1,refresh_lock=NULL,refresh_until=NULL,updated_at=now() WHERE user_id=$1`,[userId])
}
