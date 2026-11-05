import { NextResponse } from 'next/server'
import { financeRuntime } from '@/lib/finance/runtime'
import { requireFinance,financeFailure,PRIVATE_HEADERS } from '@/lib/finance/api'
import { FinanceError } from '@/lib/finance/domain'
export const dynamic='force-dynamic'
export async function GET(){
  try{
    await requireFinance()
    const {contaAzul}=financeRuntime()
    const company=await contaAzul.request('/v1/pessoas/conta-conectada')
    const list=async(path:string)=>{
      const items:Record<string,any>[]=[]
      for(let page=1;page<=100;page++){
        const r=await contaAzul.request(`${path}${path.includes('?')?'&':'?'}pagina=${page}&tamanho_pagina=100`)
        if(!Array.isArray(r.itens)||!Number.isInteger(r.itens_totais))throw new FinanceError('Catálogo Conta Azul em formato não reconhecido.',502)
        items.push(...r.itens)
        if(items.length>=r.itens_totais)return items
        if(!r.itens.length)break
      }
      throw new FinanceError('Catálogo Conta Azul incompleto.',502)
    }
    const accounts=await list('/v1/conta-financeira?apenas_ativo=true')
    const categories=await list('/v1/categorias?permite_apenas_filhos=true&apenas_filhos=true')
    return NextResponse.json({company,accounts,categories},{headers:PRIVATE_HEADERS})
  }catch(e){return financeFailure(e)}
}
