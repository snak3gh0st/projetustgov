import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash,randomBytes } from 'node:crypto'
import { oauthSession,readOauthSession,seal,unseal,validateGoogleIdentity } from './security.ts'
import { canWriteWorkspace,cnpjDigits,contactEmails,dateTime,gmailContactQuery,safeGoogleUrl,safeReturnPath,validateMeeting } from './domain.ts'
import { headerEmails,threadRelates } from './service.ts'

const key=randomBytes(32).toString('base64')
test('encrypted tokens are authenticated and isolated by user and purpose',()=>{
  const encrypted=seal('refresh-token-ação',key,'google-token:alice')
  assert.ok(!encrypted.includes('refresh-token'))
  assert.equal(unseal(encrypted,key,'google-token:alice'),'refresh-token-ação')
  assert.throws(()=>unseal(encrypted,key,'google-token:bob'))
  assert.throws(()=>unseal(encrypted,key,'google-oauth-state'))
  const tampered=Buffer.from(encrypted,'base64url');tampered[20]^=1
  assert.throws(()=>unseal(tampered.toString('base64url'),key,'google-token:alice'))
})
test('OAuth state binds the user, expiry, return path and PKCE verifier',()=>{
  const s=oauthSession('alice','/workspace/clientes/12345678000190?projectKind=comercial&projectKey=1',key,1000)
  assert.equal(s.challenge,createHash('sha256').update(s.verifier).digest('base64url'))
  assert.equal(readOauthSession(s.cookie,s.state,'alice',key,2000).verifier,s.verifier)
  assert.throws(()=>readOauthSession(s.cookie,s.state,'bob',key,2000))
  assert.throws(()=>readOauthSession(s.cookie,'other-state','alice',key,2000))
  assert.throws(()=>readOauthSession(s.cookie,s.state,'alice',key,601001))
  assert.throws(()=>readOauthSession(s.cookie,s.state,'alice',key,999))
  assert.equal(safeReturnPath('//untrusted.example/workspace'),'/workspace')
  assert.equal(safeReturnPath('/workspace/../admin'),'/workspace')
  assert.equal(safeReturnPath('/workspace?next=https://untrusted.example'),'/workspace')
})
test('corporate identity requires verified email, exact domain and matching nonce',()=>{
  const valid={nonce:'state',sub:'google-alice',email_verified:true,email:'Alice@projetus.org',hd:'projetus.org'}
  assert.equal(validateGoogleIdentity(valid,'state','projetus.org').email,'alice@projetus.org')
  for(const change of [{nonce:'wrong'},{email_verified:false},{hd:'other.org'},{email:'a@evilprojetus.org'},{sub:''}])assert.throws(()=>validateGoogleIdentity({...valid,...change},'state','projetus.org'))
})
test('mailbox matching ignores display-name spoofing but handles mixed mailbox syntax',()=>{
  assert.deepEqual(headerEmails('"client@example.test" <outsider@example.test>, real@example.test'),['outsider@example.test','real@example.test'])
  assert.equal(threadRelates({messages:[{from:'"client@example.test" <outsider@example.test>'}]},['client@example.test']),false)
  assert.equal(threadRelates({messages:[{from:'Outsider <outsider@example.test>',cc:'real@example.test'}]},['real@example.test']),true)
  assert.deepEqual(headerEmails('"Last, First" <real@example.test>'),['real@example.test'])
  assert.deepEqual(contactEmails([{email:' A@EXAMPLE.TEST '},{email:'a@example.test'},{email:'not-email'}]),['a@example.test'])
  assert.equal(gmailContactQuery(['shared+client@example.test']),'{from:"shared+client@example.test" to:"shared+client@example.test" cc:"shared+client@example.test"}')
})
test('dates, roles, document versions and official links enforce the workflow boundaries',()=>{
  assert.equal(cnpjDigits('12.345.678/0001-90'),'12345678000190')
  assert.throws(()=>cnpjDigits('123'))
  assert.equal(dateTime('2026-11-10T09:00:00-03:00'),'2026-11-10T12:00:00.000Z')
  for(const date of ['2026-02-30T12:00:00Z','2026-11-10T09:00:00','invalid'])assert.throws(()=>dateTime(date))
  assert.throws(()=>validateMeeting('2026-11-10T09:00:00Z','2026-11-10T09:00:01Z'))
  assert.throws(()=>validateMeeting('2026-11-10T09:00:00Z','2026-11-12T09:00:00Z'))
  assert.equal(canWriteWorkspace('vendedor'),true)
  for(const role of ['visualizador','csm','gestor_financeiro','projetista'])assert.equal(canWriteWorkspace(role),false)
  for(const url of ['javascript:alert(1)','https://drive.google.com.evil.example/file','https://evil.example'])assert.equal(safeGoogleUrl(url),null)
  assert.equal(safeGoogleUrl('https://docs.google.com/document/d/file/edit'),'https://docs.google.com/document/d/file/edit')
})
