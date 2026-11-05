import { NextRequest,NextResponse } from 'next/server'
import { financeFailure } from '@/lib/finance/api'
import { validSecret } from '@/lib/finance/access'
import { financeRuntime,hotmartProductIds } from '@/lib/finance/runtime'
import { normalizeHotmart } from '@/lib/finance/domain'
export const dynamic='force-dynamic'
export async function POST(request:NextRequest){
  if(!validSecret(request.headers.get('x-hotmart-hottok'),process.env.HOTMART_HOTTOK))return NextResponse.json({error:'Não autorizado.'},{status:401})
  try{
    if(Number(request.headers.get('content-length')||0)>262144)return NextResponse.json({error:'Evento excede o limite.'},{status:413})
    const text=await request.text()
    if(Buffer.byteLength(text)>262144)return NextResponse.json({error:'Evento excede o limite.'},{status:413})
    const data=JSON.parse(text)
    const allowed=hotmartProductIds()
    if(!allowed.length)return NextResponse.json({error:'Produtos Hotmart ainda não configurados.'},{status:503})
    if(!allowed.includes(String(data.data?.product?.id)))return NextResponse.json({ignored:true,reason:'Produto fora do escopo.'})
    if(!String(data.event??'').startsWith('PURCHASE_'))return NextResponse.json({ignored:true,reason:'Evento fora do escopo.'})
    return NextResponse.json(await financeRuntime().store.ingestHotmart(normalizeHotmart(data)))
  }catch(e){if(e instanceof SyntaxError)return NextResponse.json({error:'JSON inválido.'},{status:400});return financeFailure(e)}
}
