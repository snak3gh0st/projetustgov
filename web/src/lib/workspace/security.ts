import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { WorkspaceError, safeReturnPath } from './domain.ts'

export function keyBytes(secret: string) {
  const key = Buffer.from(secret, 'base64')
  if (key.length !== 32) throw new WorkspaceError('A proteção da conexão Google ainda não foi configurada.',503)
  return key
}
export function seal(value: string, secret: string, purpose: string) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',keyBytes(secret),iv)
  cipher.setAAD(Buffer.from(purpose))
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()])
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url')
}
export function unseal(value: string, secret: string, purpose: string) {
  try {
    const bytes=Buffer.from(value,'base64url')
    const cipher=createDecipheriv('aes-256-gcm',keyBytes(secret),bytes.subarray(0,12))
    cipher.setAAD(Buffer.from(purpose));cipher.setAuthTag(bytes.subarray(12,28))
    return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8')
  } catch { throw new WorkspaceError('A conexão Google precisa ser refeita.',409) }
}
export function equalSecret(a:string,b:string) {
  const aa=Buffer.from(a),bb=Buffer.from(b)
  return aa.length===bb.length&&timingSafeEqual(aa,bb)
}
export function oauthSession(userId:string,returnTo:string,secret:string,now=Date.now()) {
  const state=randomBytes(32).toString('base64url'), verifier=randomBytes(48).toString('base64url')
  const data={userId,state,verifier,returnTo:safeReturnPath(returnTo),createdAt:now}
  return{state,verifier,challenge:createHash('sha256').update(verifier).digest('base64url'),
    cookie:seal(JSON.stringify(data),secret,'google-oauth-state')}
}
export function readOauthSession(cookie:string,state:string,userId:string,secret:string,now=Date.now()) {
  const data=JSON.parse(unseal(cookie,secret,'google-oauth-state'))
  if(data.userId!==userId||typeof data.state!=='string'||!equalSecret(data.state,state)||
    typeof data.verifier!=='string'||!Number.isFinite(data.createdAt)||now<data.createdAt||now-data.createdAt>600000) {
    throw new WorkspaceError('A autorização Google expirou ou pertence a outra sessão. Conecte novamente.',400)
  }
  return{...data,returnTo:safeReturnPath(data.returnTo)} as {userId:string;verifier:string;state:string;returnTo:string;createdAt:number}
}
export function validateGoogleIdentity(claims:Record<string,unknown>,nonce:string,domain:string) {
  if(claims.nonce!==nonce||claims.email_verified!==true||typeof claims.sub!=='string'||!claims.sub||
    typeof claims.email!=='string'||String(claims.hd??'').toLowerCase()!==domain.toLowerCase()||
    !claims.email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
    throw new WorkspaceError('Autorize uma conta verificada do Google Workspace da PROJETUS.',403)
  }
  return{sub:claims.sub,email:claims.email.toLowerCase(),domain:domain.toLowerCase()}
}
