import 'server-only'
import { getPool } from '@/lib/db'
import { getValidAccessToken } from '@/lib/conta-azul/connection'
import { FinanceStore } from './store'
import { FinanceEngine } from './engine'
import { ContaAzulClient, HotmartClient } from './providers'
import { FinanceError } from './domain'
import { ContaAzulMirrorClient,refreshFromMirror } from './mirror'

export function financeRuntime(){
  const store=new FinanceStore(getPool(),process.env.CONTA_AZUL_TENANT_KEY?.trim()||'projetus')
  const engine=new FinanceEngine(store),mirror=new ContaAzulMirrorClient(store)
  return{store,engine,contaAzul:new ContaAzulClient(getValidAccessToken),refreshMirror:(from:string,to:string)=>refreshFromMirror(engine,mirror,from,to)}
}

export function hotmartProductIds(){return(process.env.HOTMART_PRODUCT_IDS??'').split(',').map(s=>s.trim()).filter(s=>/^\d+$/.test(s))}
let cached:{token:string;until:number}|null=null
async function hotmartToken(){
  if(cached&&cached.until>Date.now())return cached.token
  const id=process.env.HOTMART_CLIENT_ID,secret=process.env.HOTMART_CLIENT_SECRET,basic=process.env.HOTMART_BASIC
  if(!id||!secret||!basic)throw new FinanceError('Credenciais Hotmart ainda não configuradas.',409)
  // Official auth contract requires these query parameters. Never log this URL or provider errors verbatim.
  const q=new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret})
  let r:Response
  try{r=await fetch(`https://api-sec-vlc.hotmart.com/security/oauth/token?${q}`,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Authorization:`Basic ${basic.replace(/^Basic\s+/i,'')}`,'Content-Type':'application/json'}})}
  catch{throw new FinanceError('Falha de conexão na autenticação Hotmart.',502)}
  if(!r.ok)throw new FinanceError(`Autenticação Hotmart respondeu HTTP ${r.status}.`,502)
  const data=await r.json()
  if(typeof data.access_token!=='string')throw new FinanceError('Autenticação Hotmart sem token válido.',502)
  cached={token:data.access_token,until:Date.now()+Math.max(0,Number(data.expires_in??3600)-60)*1000}
  return cached.token
}
export function hotmartClient(){
  const ids=hotmartProductIds()
  if(!ids.length)throw new FinanceError('Configure os produtos Hotmart desta empresa antes de importar a conta master.',409)
  return new HotmartClient(hotmartToken,fetch,ids)
}

export function connectorReadiness(){return{
  hotmartCredentials:!!(process.env.HOTMART_CLIENT_ID&&process.env.HOTMART_CLIENT_SECRET&&process.env.HOTMART_BASIC),
  hotmartWebhook:!!process.env.HOTMART_HOTTOK,hotmartProducts:hotmartProductIds(),
  email:!!process.env.RESEND_API_KEY,slack:!!process.env.FINANCE_SLACK_WEBHOOK_URL,
  cron:!!process.env.CRON_SECRET,
}}
